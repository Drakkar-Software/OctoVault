/**
 * Identity bootstrap — thin wrappers that keep the old 2-arg call ergonomics
 * (`buildSession({userId,keys}, name?)`, `deriveSession(seedWords, name?)`,
 * `buildLinkedSession(linked, name?)`, `sessionFromPersisted(persisted)`) while
 * injecting the per-call `clientOpts` required by starfish-spaces.
 *
 * dk-spaces-sdk 0.31 dropped its `sessionFromPersisted` proxy — clients now call
 * starfish-spaces directly and must pass `clientOpts` themselves (2nd positional
 * arg). `activeAccountOf` / `rootIdentityOf` take no `clientOpts` and are
 * re-exported unchanged.
 */
import {
  buildSession as _buildSession,
  buildLinkedSession as _buildLinkedSession,
  deriveSession as _deriveSession,
  sessionFromPersisted as _sessionFromPersisted,
  activeAccountOf,
  rootIdentityOf,
  ownerTrustedAdders,
  generateSeedWords,
  isValidSeed,
  fingerprintFromUserId,
} from '@drakkar.software/starfish-spaces';
import type { Session, LinkedIdentity, DeviceKeys, PersistedSession } from '@drakkar.software/starfish-spaces';
import { getSyncBase, getSyncNamespace, getSharedSpacesNamespace } from '@drakkar.software/dk-spaces-sdk';

export type { Session, LinkedIdentity, PersistedSession };
export { ownerTrustedAdders, generateSeedWords, isValidSeed, fingerprintFromUserId, activeAccountOf, rootIdentityOf };

/** Current global connection opts, injected into each session builder. */
function clientOpts() {
  return { baseUrl: getSyncBase(), namespace: getSyncNamespace() ?? '' };
}

/** Derive a session from a BIP-39 seed phrase. Preserves old `(seedWords, name?)` signature. */
export async function deriveSession(seedWords: string[], name?: string): Promise<Session> {
  return _deriveSession(seedWords, clientOpts(), { name, sharedNamespace: getSharedSpacesNamespace() ?? undefined });
}

/** Build a session from a pre-derived root identity. Preserves old `({userId,keys}, name?)` signature. */
export async function buildSession(
  opts: { userId: string; keys: DeviceKeys },
  name?: string,
): Promise<Session> {
  return _buildSession({ ...opts, name, clientOpts: clientOpts(), sharedNamespace: getSharedSpacesNamespace() ?? undefined });
}

/** Build a session from a QR-paired linked identity. Preserves old `(linked, name?)` signature. */
export async function buildLinkedSession(linked: LinkedIdentity, name?: string): Promise<Session> {
  return _buildLinkedSession({
    identity: linked,
    name,
    clientOpts: clientOpts(),
    sharedNamespace: getSharedSpacesNamespace() ?? undefined,
  });
}

/** Restore a session from a persisted account. Preserves old `(persisted)` signature. */
export async function sessionFromPersisted(persisted: PersistedSession): Promise<Session> {
  return _sessionFromPersisted(persisted, clientOpts(), {
    sharedNamespace: getSharedSpacesNamespace() ?? undefined,
  });
}
