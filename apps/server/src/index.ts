import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  createSyncRouter,
  createCapCertRoleResolver,
  createInMemoryNonceCache,
  createGracefulShutdown,
  saveConfig,
} from "@drakkar.software/starfish-server";
import { createEventsRoute } from "./events.js";
import { createUnfurlRoute } from "./unfurl.js";
import { FilesystemObjectStore } from "@drakkar.software/starfish-server/node";
import { identitiesServerPlugin } from "@drakkar.software/starfish-identities";
import { sharingServerPlugin } from "@drakkar.software/starfish-sharing";
import { createQueuingServerPlugin } from "@drakkar.software/starfish-queuing";
import { createProjectionServerPlugin } from "@drakkar.software/starfish-projection";
// makeSpaceRoleEnricher retired — replaced by createSpacesRoleEnricher from starfish-spaces.
import { createSpacesRoleEnricher, createSpacesDirectoryServerPlugin } from "@drakkar.software/starfish-spaces";

import { config } from "./config.js";
import { projections } from "./projections.js";
import { createNatsQueue } from "./queue.js";
import { createFileRevocationStore } from "./revocation-store.js";

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.STARFISH_DATA_DIR ?? "./data";
const HOSTNAME = process.env.HOST ?? "0.0.0.0";

// Comma-separated allowlist (e.g. "https://app.example.com,https://staging.example.com").
// When empty (dev default) any origin is echoed; when set, only listed origins are allowed.
const CORS_ALLOW = (process.env.STARFISH_CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (CORS_ALLOW.length === 0 && process.env.NODE_ENV === "production") {
  console.warn(
    "[OctoVault] SECURITY: STARFISH_CORS_ORIGINS is unset in production — CORS echoes any " +
      "Origin and any requested headers. Set it to your app's origin allowlist " +
      "(e.g. https://app.example.com) so a hostile page can't drive this API.",
  );
}

if (!process.env.WHISTLERS_INTERNAL_URL && process.env.NODE_ENV === "production") {
  console.warn(
    "[OctoVault] WHISTLERS_INTERNAL_URL is unset — SSE change-events will proxy to " +
      "http://localhost:8080/events. Set WHISTLERS_INTERNAL_URL to the internal Whistlers " +
      "address so the /events endpoint reaches the correct host in production.",
  );
}

function allowOrigin(reqOrigin: string | undefined): string {
  if (CORS_ALLOW.length === 0) return reqOrigin ?? "*"; // permissive dev default
  if (reqOrigin && CORS_ALLOW.includes(reqOrigin)) return reqOrigin;
  return CORS_ALLOW[0]; // a non-matching origin → browser blocks the response
}

const store = new FilesystemObjectStore({ baseDir: DATA_DIR });

// Cap-cert auth: device caps (identities plugin) + member caps (sharing plugin).
// Nonce cache stays in-memory (replay window is ephemeral by nature); the
// revocation store is file-backed so revokes survive a restart.
// Both are constructed separately so the /events route can share them (same nonce
// namespace for replay protection across all authenticated endpoints).
// windowMs MUST be >= 2x the accepted clock-skew (DEFAULT_MAX_SKEW_MS = 5 min) per the
// SDK contract: a request is accepted across [ts - skew, ts + skew], so the nonce must
// be remembered for the full 2x skew or a replay slot re-opens. So 10 min, not 5.
const nonceCache = createInMemoryNonceCache({ windowMs: 10 * 60_000, maxEntries: 100_000 });
const revocationStore = createFileRevocationStore(`${DATA_DIR}/_revocations.json`);
const roleResolver = createCapCertRoleResolver({
  nonceCache,
  revocationStore,
  allowAnonymous: true, // public-read collections (profile, pairing)
  plugins: [identitiesServerPlugin, sharingServerPlugin],
  // The resolver buffers the body to verify the request signature and checks
  // it against this global ceiling BEFORE the per-collection limit runs (it
  // defaults to 64 KB). Raise it to the largest collection cap (attachments,
  // ~11 MB) so blob uploads aren't 413'd here; per-collection `maxBodyBytes`
  // still enforces each collection's own tighter limit downstream.
  maxBodyBytes: 11_534_336,
});

// Publish a change-event to NATS after each successful push/append to the workspace
// collections (params {spaceId,objectId,nodeId} only — content stays E2E-encrypted
// for enc nodes; public/invite-plaintext nodes carry no inline content in events),
// which Whistlers can re-serve as SSE. Metadata only, opt-in per collection.
// The object tree index + WAL op-log + merge-doc + public node content publish on
// `octospaces.object.changed` so a write wakes other devices to pull new ops.
// snapshot (`objsnap`) writes are NOT queued — readers resume from the log.
const { queue, nc } = await createNatsQueue();
const queuing = createQueuingServerPlugin({
  queue,
  collections: {
    objindex:  { topic: "octospaces.object.changed", includeParams: true, includeIdentity: false },
    objlog:    { topic: "octospaces.object.changed", includeParams: true, includeIdentity: false },
    objdoc:    { topic: "octospaces.object.changed", includeParams: true, includeIdentity: false },
    objpub:    { topic: "octospaces.object.changed", includeParams: true, includeIdentity: false },
    objinv:    { topic: "octospaces.object.changed", includeParams: true, includeIdentity: false },
    typeindex: { topic: "octospaces.object.changed", includeParams: true, includeIdentity: false },
  },
});

// Space-membership enricher: synthesizes `space:owner` / `space:member` from
// the access record at `spaces/{spaceId}/_access`. Shared between the sync router
// (collection-level gating) and the /events proxy (membership validation).
// createSpacesRoleEnricher (starfish-spaces) replaces the hand-rolled makeSpaceRoleEnricher.
const spaceEnricher = createSpacesRoleEnricher(store);

// Legacy projection: maintains the public-space directory at `_index/spaces/public`.
const projection = createProjectionServerPlugin({ store, projections });

// The canonical spaces directory plugin: writes public-node metadata to
// `_index/objects/public` on each objindex write.
const spacesDirectory = createSpacesDirectoryServerPlugin({
  getString: (k) => store.getString(k),
  putString: (k, v) => store.put(k, v),
});

const syncRouter = createSyncRouter({
  store,
  config,
  roleResolver,
  // Grants `space:owner` / `space:member` from the access record.
  roleEnricher: spaceEnricher,
  plugins: [queuing, projection, spacesDirectory],
});

await saveConfig(store, config);

const app = new Hono();

// CORS: echo the browser's requested headers on preflight so the cap-cert auth
// headers (Authorization: Cap, X-Starfish-*) are always allowed. The allowed
// origin is gated by STARFISH_CORS_ORIGINS (permissive when unset — dev default).
app.use("*", async (c, next) => {
  const origin = allowOrigin(c.req.header("Origin"));
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": c.req.header("Access-Control-Request-Headers") ?? "*",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }
  await next();
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Vary", "Origin");
});

// Authenticated SSE proxy: gates the Whistlers stream per caller's space membership.
// Must be mounted BEFORE the sync router so /events is not swallowed by its catch-all.
app.route(
  "/",
  createEventsRoute({ enricher: spaceEnricher, nonceCache, revocationStore }),
);

// Public OG-unfurl endpoint: fetches a URL server-side and returns OpenGraph metadata.
// No auth required — the URL is caller-supplied and the result is non-sensitive metadata.
// Mount before the sync router so /unfurl is not swallowed by its catch-all.
app.route("/", createUnfurlRoute());

// starfish-server is typed against the satellite workspace's hono copy; it's
// runtime-compatible with ours, so cast across the nominal type-identity gap.
app.route("/", syncRouter as unknown as Hono);

// Runs the queuing plugin's shutdown hook, then drains the NATS connection.
createGracefulShutdown({
  plugins: [queuing],
  onShutdown: async () => {
    await nc?.drain();
  },
});

serve({ fetch: app.fetch, port: PORT, hostname: HOSTNAME }, (info) => {
  console.log(`OctoVault Starfish server listening on http://${HOSTNAME}:${info.port} (data: ${DATA_DIR})`);
});
