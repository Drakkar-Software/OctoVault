/**
 * OctoVault app-boot wiring: reads EXPO_PUBLIC_* env vars and calls
 * `configureOctoVault` + `configureKv` on the SDK before any sync call runs.
 *
 * Import this module at the top of `apps/mobile/src/app/_layout.tsx` (or any
 * other entry point) BEFORE importing React providers.  The module executes
 * the configuration at import-time so the SDK getters return non-null values
 * from the very first frame.
 */
import { configureKv, configureOctoVault } from '@drakkar.software/octovault-sdk';
import { kvGet, kvRemove, kvSet } from '@drakkar.software/octovault-sdk/platform';
// One-time octospaces→dk KV prefix migration (spaceaccess store only) — must run
// before the first sync call. Side-effect import; Metro resolves the .native
// variant on native. See kv-migration.ts / kv-migration.native.ts, MIGRATION_CLEANUP.md.
import './kv-migration';

export const SYNC_BASE = process.env.EXPO_PUBLIC_STARFISH_URL ?? 'http://localhost:8787';

const _ns = process.env.EXPO_PUBLIC_STARFISH_NAMESPACE?.trim() ?? '';
if (_ns !== '' && !/^[A-Za-z0-9_-]+$/.test(_ns)) {
  throw new Error(
    `EXPO_PUBLIC_STARFISH_NAMESPACE must be a bare name ([A-Za-z0-9_-]+), got "${_ns}"`,
  );
}
export const SYNC_NAMESPACE = _ns || undefined;
const SYNC_PREFIX = SYNC_NAMESPACE ? `/v1/${SYNC_NAMESPACE}` : '';
const EVENTS_URL = process.env.EXPO_PUBLIC_EVENTS_URL ?? `${SYNC_BASE}${SYNC_PREFIX}/events`;
const WEB_BASE = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/+$/, '');

const _sns = process.env.EXPO_PUBLIC_SHARED_SPACES_NAMESPACE?.trim() ?? '';
const SHARED_SPACES_NAMESPACE = _sns || undefined;

configureOctoVault({
  syncBase: SYNC_BASE,
  syncNamespace: SYNC_NAMESPACE,
  syncPrefix: SYNC_PREFIX,
  eventsUrl: EVENTS_URL,
  webBase: WEB_BASE,
  ...(SHARED_SPACES_NAMESPACE ? { sharedSpacesNamespace: SHARED_SPACES_NAMESPACE } : {}),
});

configureKv({ get: kvGet, set: kvSet, remove: kvRemove });
