/**
 * Authenticated SSE proxy — gates the Whistlers object-change stream behind
 * cap-cert auth and per-space membership validation.
 *
 * Auth: verifies the cap-cert + per-request Ed25519 signature WITHOUT enforcing
 * scope.paths (meta-endpoint, not a data collection; access is controlled by the
 * per-space membership check that follows).
 *
 * Filter: client declares candidate spaceIds via ?spaces=sp-a,sp-b. All spaces are
 * validated against `spaces/{id}/_access` membership (createSpacesRoleEnricher). The
 * authorized ids map to sanitized Whistlers destinationTopics, and only those topics
 * proxy upstream. There is no space-level public concept — per-node access flags
 * control content visibility; SSE always requires membership.
 *
 * ★ Firehose-prevention invariant: the upstream Whistlers URL ALWAYS carries at
 * least one ?topic= param. An empty authorized set substitutes the sentinel
 * "__none__" (matches nothing). Never omit all ?topic= — that makes Whistlers
 * stream the global firehose to an unauthorized client.
 *
 * Whistlers topic derivation: queue.ts onPublish emits
 * `octospaces.object.changed.<spaceId>`; Whistlers applies the `octospaces` namespace
 * prefix then sanitizeTopic — every char outside [a-zA-Z0-9-_~%] → "-", giving
 * `octospaces-octospaces-object-changed-<spaceId>`. This proxy reconstructs that exact
 * transform server-side so Whistlers' ?topic= filter matches.
 */
import { Hono, type Context } from "hono";
import {
  verifyCapCert,
  verifyRequestSignature,
  isWithinClockSkew,
  getBase64,
  type CapCert,
} from "@drakkar.software/starfish-protocol";
import type {
  NonceCache,
  RevocationStore,
  RoleEnricher,
} from "@drakkar.software/starfish-server";

// SPACE_MEMBER_ROLE is not exported by starfish-spaces; define inline.
// TODO: import from starfish-spaces when it exports the constant (tracks createSpacesRoleEnricher config.memberRole).
const SPACE_MEMBER_ROLE = 'space:member';

const WHISTLERS_INTERNAL_URL =
  process.env.WHISTLERS_INTERNAL_URL ?? "http://localhost:8080/events";

/** Exact sanitizeTopic from Whistlers bridge.ts:30-32. */
const sanitizeTopic = (t: string) => t.replace(/[^a-zA-Z0-9\-_~%]/g, "-");

/** Whistlers namespace — MUST match the namespace key in infra/whistlers.config.json. */
const WHISTLERS_NAMESPACE = "octospaces";

/**
 * Build the sanitized Whistlers destinationTopic for a given spaceId.
 * Exported for unit testing — the exact string must survive as `octospaces.object.changed`
 * (not the old `octovault.object.changed`) so the SSE proxy subscribes to the right topic.
 */
export function buildWhistlersTopic(spaceId: string): string {
  return `${WHISTLERS_NAMESPACE}-${sanitizeTopic(`octospaces.object.changed.${spaceId}`)}`;
}

/**
 * Resolve which Whistlers topics an authenticated identity may subscribe to.
 *
 * For each candidate spaceId the enricher is consulted; only spaces where the
 * identity holds `space:member` are admitted. The result is the ready-to-proxy
 * topic list, including the firehose-prevention sentinel `["__none__"]` when
 * no space is authorized (avoids forwarding all events to the caller).
 *
 * Exported for unit testing — lets us cover the membership gate + sentinel
 * without exercising the full cap-cert auth stack.
 */
export async function authorizeTopics(
  identity: string,
  candidates: string[],
  enricher: RoleEnricher,
): Promise<string[]> {
  const authorized: string[] = [];
  for (const spaceId of candidates) {
    try {
      const roles = await enricher({ identity, roles: [] }, { spaceId });
      if (roles.includes(SPACE_MEMBER_ROLE)) authorized.push(spaceId);
    } catch {
      // Enricher failure (e.g. store unavailable) → treat as not-a-member.
    }
  }
  const topics = authorized.map((s) => buildWhistlersTopic(s));
  // ★ Firehose-prevention invariant: never return an empty array — Whistlers with
  // no ?topic= streams the global firehose. Substitute a never-matching sentinel.
  return topics.length > 0 ? topics : ["__none__"];
}

function parseCapHeader(authHeader: string): CapCert | null {
  if (!authHeader.startsWith("Cap ")) return null;
  const b64 = authHeader.slice("Cap ".length).trim();
  if (!b64) return null;
  try {
    const json = new TextDecoder().decode(getBase64().decode(b64));
    return JSON.parse(json) as CapCert;
  } catch {
    return null;
  }
}

/**
 * Authenticate a GET /events request: verify cap-cert + per-request Ed25519
 * signature, replay-protect via nonce cache, check revocation.
 *
 * Deliberately does NOT enforce scope.paths — /events is a meta-endpoint; the
 * per-space membership check (step 3 of the handler) gates actual access.
 * The nonce cache is shared with the main sync router for replay protection
 * across both endpoints.
 *
 * Returns the caller's identity string, or null on any auth failure.
 */
async function authenticateEventsRequest(
  c: Context,
  opts: { nonceCache: NonceCache; revocationStore: RevocationStore },
): Promise<string | null> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return null;
  const cert = parseCapHeader(authHeader);
  if (!cert) return null;

  const sigB64 = c.req.header("X-Starfish-Sig");
  const tsStr = c.req.header("X-Starfish-Ts");
  const nonce = c.req.header("X-Starfish-Nonce");
  if (!sigB64 || !tsStr || !nonce) return null;

  const tsNum = Number(tsStr);
  if (!Number.isFinite(tsNum) || !isWithinClockSkew(tsNum, Date.now())) return null;

  const certResult = await verifyCapCert(cert, { now: Math.floor(Date.now() / 1000) });
  if (!certResult.ok) return null;

  // The per-request signature is signed by the cap's subject key (cert.sub).
  // As of starfish 3.0.0-alpha.1, `sub` is optional — absent on `audience` caps
  // (public links), which carry no single subject and cannot sign here. /events
  // only ever serves device/member caps, so require a concrete subject (also
  // narrows `cert.sub` to string for the signature/nonce/revocation checks below).
  if (!cert.sub) return null;

  // Verify the per-request signature, bound to this exact URL + host.
  let pathAndQuery: string;
  let host: string;
  try {
    const u = new URL(c.req.url);
    pathAndQuery = u.pathname + u.search;
    host = u.host;
  } catch {
    // Reverse proxy forwarded a path-only URL — host defaults to "" which
    // changes the signed message and will cause verifyRequestSignature to fail.
    console.warn("[OctoVault] /events: failed to parse request URL", c.req.url);
    pathAndQuery = c.req.url;
    host = "";
  }

  // Verify the per-request signature with the cap subject's Ed25519 key.
  // alpha.12 collapsed the wire to a single suite, so no `alg` discriminator.
  const sigOk = await verifyRequestSignature(
    { method: "GET", pathAndQuery, host },
    { sig: sigB64, ts: tsNum, nonce },
    cert.sub,
  );
  if (!sigOk) return null;

  // Replay protection — shared nonce cache with the sync router.
  if (!opts.nonceCache.checkAndRemember(cert.sub, nonce, Date.now())) return null;

  // Revocation check.
  if (opts.revocationStore.isRevoked(cert.iss, cert.sub, cert.nonce)) return null;

  // Bind identity (device cap → issuer; member cap → subject).
  if (cert.kind === "device") return cert.issUserId;
  if (cert.kind === "member" && cert.subUserId) return cert.subUserId;
  return null;
}

export interface EventsRouteOptions {
  enricher: RoleEnricher;
  nonceCache: NonceCache;
  revocationStore: RevocationStore;
}

export function createEventsRoute(opts: EventsRouteOptions): Hono {
  const { enricher, nonceCache, revocationStore } = opts;
  const app = new Hono();

  app.get("/events", async (c) => {
    // 1. Authenticate — reject unauthenticated requests.
    const identity = await authenticateEventsRequest(c, { nonceCache, revocationStore });
    if (!identity) {
      return c.json({ error: "unauthorized" }, 401);
    }

    // 2. Read candidate space ids from ?spaces=sp-a,sp-b (client-declared).
    const spacesParam = c.req.query("spaces") ?? "";
    const candidates = spacesParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Reject empty candidate lists early — a long-lived SSE connection that would
    // only proxy __none__ wastes a server fd and an upstream Whistlers connection.
    if (candidates.length === 0) {
      return c.json({ error: "spaces param required" }, 400);
    }

    // 3–5. Authorize candidates against membership, map to Whistlers topics,
    //      and apply the firehose-prevention sentinel — all in one tested helper.
    const safeTopics = await authorizeTopics(identity, candidates, enricher);

    // 6. Proxy the upstream Whistlers SSE stream.
    //    Propagate the client's abort signal so disconnecting the browser closes
    //    the upstream connection — without this every disconnect leaks a connection.
    const qs = safeTopics.map((t) => `topic=${encodeURIComponent(t)}`).join("&");
    const upstreamUrl = `${WHISTLERS_INTERNAL_URL}?${qs}`;

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        headers: { Accept: "text/event-stream" },
        signal: c.req.raw.signal,
      });
    } catch {
      return c.json({ error: "upstream unavailable" }, 503);
    }

    if (!upstream.ok || !upstream.body) {
      return c.json({ error: "upstream error" }, 502);
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  return app;
}
