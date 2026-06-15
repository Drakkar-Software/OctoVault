/**
 * Collection path + cap-scope helpers for OctoVault.
 *
 * Re-exports the shared OctoSpaces path/scope surface. OctoVault uses the same
 * generic `obj*` collection family and the same cap-scope model; no vault-specific
 * path helpers are needed beyond what octospaces-sdk provides.
 *
 * Removed (pubspace subsystem dropped in favour of per-node access:'public'):
 *   pubObjIndex*, pubspaceAccess*, pubspaceRoom*, pubstreamRoom*, spaceIndex*
 *   pubspaceScope, pubstreamBotScope, spaceIdFromCap
 */
export {
  // ── Object collections constant (for cap scopes) ──────────────────────────
  OBJECT_COLLECTIONS,

  // ── Cap scopes ─────────────────────────────────────────────────────────────
  ownerScope,
  spaceMemberScope,
  nodeMemberScope,
  accountScope,
  linkedDeviceScope,

  // ── Space-wide keyring (one per space, encrypts all enc nodes) ────────────
  keyringName,
  keyringPull,
  keyringPush,

  // ── Attachments ────────────────────────────────────────────────────────────
  attachmentPull,
  attachmentPush,

  // ── Profile + registries ───────────────────────────────────────────────────
  profilePull,
  profilePush,
  spacesPull,
  spacesPush,
  // spaceAccessPull/Push now return `_access` (not `_rooms`)
  spaceAccessPull,
  spaceAccessPush,

  // ── Object index (plaintext, member-gated) ─────────────────────────────────
  objIndexPull,
  objIndexPush,

  // ── Space-tier & general object content ────────────────────────────────────
  objLogPull,
  objLogPush,
  objDocPull,
  objDocPush,
  objectBlobPull,
  objectBlobPush,

  // ── Public node content (access:'public', world-readable) ──────────────────
  objPubName,
  objPubPull,
  objPubPush,

  // ── Invite-only plaintext content (access:'invite'+enc:false, cap-gated) ───
  objInvName,
  objInvPull,
  objInvPush,

  // ── Per-space custom type registry ─────────────────────────────────────────
  typesIndexPull,
  typesIndexPush,

  // ── Global object directory (server-maintained projection) ─────────────────
  objectDirName,
  objectDirPull,
  readObjectDirectory,
  parseObjectDirectoryDoc,

  // ── Utilities ──────────────────────────────────────────────────────────────
  userIdFromEdPub,
  bytesToHex,

  // ── Path-name helpers (promoted to octospaces-sdk) ─────────────────────────
  spaceIdFromRoomId,
  attachmentName,
  objIndexName,
  objLogName,
  objDocName,
  objectBlobName,
  typesIndexName,
} from '@drakkar.software/octospaces-sdk';
export type { PublicObjectDirEntry } from '@drakkar.software/octospaces-sdk';
