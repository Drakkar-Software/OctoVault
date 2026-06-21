/**
 * OctoVault SDK — sync server configuration.
 *
 * The SDK is platform-agnostic and never reads `process.env` directly.
 * At boot, the app calls {@link configureOctoVault} with the env-derived values;
 * all SDK modules call the getter functions below instead of importing the env vars.
 *
 * Also wires the shared `@drakkar.software/octospaces-sdk` config so that all
 * re-exported octospaces modules (identity, registry, members, object-index, …)
 * are correctly configured from the same call.
 */
import { configureOctoSpaces } from '@drakkar.software/octospaces-sdk';

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
 * without requiring a separate `configureOctoSpaces` call at the app level.
 */
export function configureOctoVault(config: Partial<OctoVaultConfig>): void {
  _config = { ..._config, ...config };
  // Forward to octospaces-sdk so its internal getters (getSyncBase, getSyncNamespace,
  // getSyncPrefix, getEventsUrl) are populated. All re-exported octospaces modules
  // (client, identity, registry, members, object-index, …) delegate to those getters —
  // they throw if unconfigured. (`webBase` is kept locally on OctoVaultConfig; octospaces
  // dropped its `webBase` config field, so it is no longer forwarded.)
  configureOctoSpaces({
    syncBase: _config.syncBase,
    syncNamespace: _config.syncNamespace,
    eventsUrl: _config.eventsUrl,
    ...(_config.sharedSpacesNamespace ? { sharedSpacesNamespace: _config.sharedSpacesNamespace } : {}),
  });
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


