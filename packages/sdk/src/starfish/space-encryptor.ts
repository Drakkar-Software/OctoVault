/**
 * Re-exports the shared octospaces-sdk per-node access resolver.
 *
 * The old vault space-encryptor model (one Encryptor per space) is replaced by the
 * octospaces per-node access model:
 *   - getSpaceEncryptor(spaceId, session, reg) → getNodeAccess(spaceId, nodeId, node, session, reg)
 *   - buildSpaceEncryptor(session, spaceId)    → buildNodeAccess(spaceId, nodeId, node, session)
 *   - clearSpaceEncryptors()                  → clearNodeAccessCache()
 *   - SpaceEncryptor                          → NodeAccessHandle
 *
 * The returned `NodeAccessHandle` has `{ client, encryptor | null, isOwnerOpen }`.
 * `encryptor` is null for plaintext nodes (access:'space'/'public' without enc:true).
 */
export {
  SpaceAccessError,
  getSpaceClient,
  getNodeAccess,
  buildNodeAccess,
  clearNodeAccessCache,
  openEncryptor,
  buildEncryptor,
  ownerTrustedAdders,
  ownerEnsureKeyring,
} from '@drakkar.software/octospaces-sdk';
export type { NodeAccessHandle } from '@drakkar.software/octospaces-sdk';

