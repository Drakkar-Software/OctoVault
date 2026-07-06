/**
 * One-time KV prefix migration — web variant (localStorage).
 *
 * dk-spaces-sdk 0.32 rebased its KV prefixes off the `octospaces` namespace: the
 * persisted space-access store moved `octospaces.spaceaccess.*` → `dk.spaceaccess.*`.
 * It re-hydrates losslessly from the server on a cold-read miss, but we rename in
 * place here to avoid that miss. One-time; mirrors the native migration in
 * kv-migration.native.ts (localStorage is directly enumerable, unlike the generic
 * KvAdapter `get`/`set`/`remove` seam, so this can't live in the SDK).
 *
 * OctoVault does NOT need the `profile.v1` half OctoChat's equivalent shim has —
 * OctoVault never calls `cacheProfile`/`loadCachedProfile` (its `starfish/client.ts`
 * reads profiles directly, no caching layer in front). Mutes/reads keys are also
 * unaffected — `mutePrefsConfig('octovault')`/`readPrefsConfig('octovault')` keep
 * the same namespace string.
 *
 * See MIGRATION_CLEANUP.md — remove once the rollout window has passed.
 */
const PREFIX_MIGRATION_FLAG = 'dk-migration:v1:done';
const FROM_PREFIX = 'octospaces.spaceaccess.';
const TO_PREFIX = 'dk.spaceaccess.';

if (typeof globalThis.localStorage !== 'undefined' && !globalThis.localStorage.getItem(PREFIX_MIGRATION_FLAG)) {
  try {
    const ls = globalThis.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k) keys.push(k);
    }
    for (const key of keys) {
      if (!key.startsWith(FROM_PREFIX)) continue;
      const target = TO_PREFIX + key.slice(FROM_PREFIX.length);
      if (ls.getItem(target) === null) {
        const value = ls.getItem(key);
        if (value != null) ls.setItem(target, value);
      }
    }
    ls.setItem(PREFIX_MIGRATION_FLAG, '1');
  } catch (e) {
    console.warn('[kv-migration] octospaces→dk spaceaccess KV prefix migration failed', e);
    // Flag not set — will retry on next boot. Cold-read miss in the meantime is
    // lossless (server re-hydrates the space-access store).
  }
}
