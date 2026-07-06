/**
 * One-time KV prefix migration — native variant (AsyncStorage).
 *
 * dk-spaces-sdk 0.32 rebased its KV prefixes off the `octospaces` namespace: the
 * persisted space-access store moved `octospaces.spaceaccess.*` → `dk.spaceaccess.*`.
 * It re-hydrates losslessly from the server on a cold-read miss, but we rename in
 * place here to avoid that miss. One-time, deferred behind
 * InteractionManager.runAfterInteractions to avoid competing with session-context's
 * first kv reads on the same boot frame.
 *
 * OctoVault does NOT need the `profile.v1` half OctoChat's equivalent shim has —
 * OctoVault never calls `cacheProfile`/`loadCachedProfile`. Mutes/reads keys are
 * also unaffected — `mutePrefsConfig('octovault')`/`readPrefsConfig('octovault')`
 * keep the same namespace string.
 *
 * See MIGRATION_CLEANUP.md — remove once the rollout window has passed.
 */
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX_MIGRATION_FLAG = 'dk-migration:v1:done';
const FROM_PREFIX = 'octospaces.spaceaccess.';
const TO_PREFIX = 'dk.spaceaccess.';

InteractionManager.runAfterInteractions(() => {
  void (async () => {
    try {
      if (await AsyncStorage.getItem(PREFIX_MIGRATION_FLAG)) return;
      const allKeys = await AsyncStorage.getAllKeys();
      const ourKeys = allKeys.filter((k) => k.startsWith(FROM_PREFIX));
      if (ourKeys.length > 0) {
        const pairs = await AsyncStorage.multiGet(ourKeys);
        const toWrite: [string, string][] = [];
        for (const [k, v] of pairs) {
          if (!k || v == null) continue;
          const target = TO_PREFIX + k.slice(FROM_PREFIX.length);
          if ((await AsyncStorage.getItem(target)) === null) toWrite.push([target, v]);
        }
        if (toWrite.length > 0) await AsyncStorage.multiSet(toWrite);
      }
      await AsyncStorage.setItem(PREFIX_MIGRATION_FLAG, '1');
    } catch (e) {
      console.warn('[kv-migration] octospaces→dk spaceaccess KV prefix migration failed', e);
      // Flag not set — will retry on next boot. Cold-read miss in the meantime is
      // lossless (server re-hydrates the space-access store).
    }
  })();
});
