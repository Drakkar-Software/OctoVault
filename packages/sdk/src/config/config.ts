/**
 * OctoVault SDK — sync server configuration.
 *
 * The SDK is platform-agnostic and never reads `process.env` directly.
 * At boot, the app calls {@link configureOctoVault} with the env-derived values;
 * all SDK modules call the getter functions below instead of importing the env vars.
 *
 * Also wires the shared `@drakkar.software/dk-spaces-sdk` config so that all
 * re-exported DKSpaces modules (identity, registry, members, object-index, …)
 * are correctly configured from the same call.
 *
 * Then installs the OctoVault SpaceLayout via `configureSpaces` so every session
 * builder (fresh + restore) mints account/linked-device caps with explicit
 * collections instead of `["*"]` — preventing a 403 on `_spaces`.
 */
import { configureDKSpaces } from '@drakkar.software/dk-spaces-sdk';
import { configureSpaces } from '@drakkar.software/starfish-spaces';
import { octoVaultLayout } from '../starfish/client';
import { CACHE_FALLBACK_STATUSES, PULL_CACHE_MAX_AGE_MS, pullCache, resetPullCache } from '../starfish/pull-cache';

interface OctoVaultConfig {
  syncBase: string;
  syncNamespace: string | undefined;
  syncPrefix: string;
  eventsUrl: string;
  webBase: string;
  /** Separate namespace for `user/{userId}/_spaces` reads/writes, enabling a
   *  shared joined-space list across OctoVault and OctoChat. When set, both apps
   *  must agree on the same value. Absent → uses `syncNamespace` (per-app silo). */
  sharedSpacesNamespace?: string;
  /** Invoked when a background revalidation succeeds after a stale cache-fallback.
   *  The app wires this to its connectivity signal so offline views recover. */
  onServerReachable?: () => void;
}

let _config: OctoVaultConfig = {
  syncBase: 'http://localhost:8787',
  syncNamespace: undefined,
  syncPrefix: '',
  eventsUrl: 'http://localhost:8787/events',
  webBase: '',
};

/**
 * Configure the SDK with the sync server's coordinates. Call once at app boot
 * (before any other SDK function), passing the env-derived values.
 *
 * Also configures the shared octospaces-sdk so all re-exported modules work
 * without requiring a separate `configureOctoSpaces` call at the app level,
 * then installs the OctoVault SpaceLayout via `configureSpaces`.
 */
export function configureOctoVault(config: Partial<OctoVaultConfig>): void {
  _config = { ..._config, ...config };
  resetPullCache();
  // Forward to dk-spaces-sdk so its internal getters (getSyncBase, getSyncNamespace,
  // getSyncPrefix, getEventsUrl) are populated. All re-exported DKSpaces modules
  // (client, identity, registry, members, object-index, …) delegate to those getters —
  // they throw if unconfigured. (`webBase` is kept locally on OctoVaultConfig; DKSpaces
  // dropped its `webBase` config field, so it is no longer forwarded.)
  configureDKSpaces({
    syncBase: _config.syncBase,
    syncNamespace: _config.syncNamespace,
    eventsUrl: _config.eventsUrl,
    ...(_config.sharedSpacesNamespace ? { sharedSpacesNamespace: _config.sharedSpacesNamespace } : {}),
    // Offline reads for the session clients dk-spaces builds itself. (Space clients
    // from `makeSpaceClient` already fall back to their own `defaultPullCache()`;
    // what they lack is the stale-on-5xx policy and the recovery callback.)
    // `pullCache()` is lazy: it captures the kv shims that `configureKv` installs
    // right after this call.
    cache: pullCache(),
    cacheMaxAgeMs: PULL_CACHE_MAX_AGE_MS,
    cacheFallbackStatuses: [...CACHE_FALLBACK_STATUSES],
    ...(_config.onServerReachable ? { onServerReachable: _config.onServerReachable } : {}),
  });
  // Install the OctoVault layout module-wide. configureSpaces merges, so any kvAdapter
  // already set by configureKv is preserved. Must run after configureOctoSpaces so
  // getSyncBase()/getSyncNamespace() are ready when octoVaultLayout() reads them.
  configureSpaces({ layout: octoVaultLayout() });
}

/** Base URL of the Starfish sync server, e.g. `https://sync.example.com`. */
export function getSyncBase(): string {
  return _config.syncBase;
}

/** Starfish namespace name (undefined for a root-mounted local dev server). */
export function getSyncNamespace(): string | undefined {
  return _config.syncNamespace;
}

/**
 * Namespaced path prefix (`/v1/<namespace>`, or '') for raw requests that live
 * outside the StarfishClient (SSE `GET /events`, raw profile GET).
 */
export function getSyncPrefix(): string {
  return _config.syncPrefix;
}

/** SSE event endpoint URL. */
export function getEventsUrl(): string {
  return _config.eventsUrl;
}
