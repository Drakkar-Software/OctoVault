/**
 * Identity bootstrap — thin wrappers that keep the old 2-arg call ergonomics
 * (`buildSession({userId,keys}, name?)`, `deriveSession(seedWords, name?)`,
 * `buildLinkedSession(linked, name?)`) while injecting the per-call `clientOpts`
 * required by starfish-spaces 0.25+.
 */
import {
  buildSession as _buildSession,
  buildLinkedSession as _buildLinkedSession,
  deriveSession as _deriveSession,
  ownerTrustedAdders,
  generateSeedWords,
  isValidSeed,
  fingerprintFromUserId,
} from '@drakkar.software/starfish-spaces';
import type { Session, LinkedIdentity, DeviceKeys } from '@drakkar.software/starfish-spaces';
import { getSyncBase, getSyncNamespace, getSharedSpacesNamespace } from '@drakkar.software/octospaces-sdk';

export type { Session, LinkedIdentity };
export { ownerTrustedAdders, generateSeedWords, isValidSeed, fingerprintFromUserId };

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
