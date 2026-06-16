// @drakkar.software/octovault-sdk
// Pure, React-free logic for OctoVault: crypto/identity, Starfish sync, WAL/CRDT
// document models, data registries, pure helpers.
//
// The shared octospaces-sdk surface is re-exported here; the vault adds only its
// own WAL engine, content models, domain descriptors, and vault-specific helpers.

// ── Config / DI seams ─────────────────────────────────────────────────────────
export * from './config/config';
export * from './config/kv';

// ── Domain types ──────────────────────────────────────────────────────────────
export type { IconName } from './domain/icon-name';
export type { TextVariant } from './domain/text-variant';
export * from './domain/types';
// domain/object-types: re-export everything EXCEPT PropKind/EditorKind which
// conflict with the same names in starfish/object-types-store. Consumers that
// need both can import directly from the sub-modules.
export type {
  PropKind, EditorKind,
  PropOption, PropField, TypeDescriptor, ObjectDescriptor, CreatableTypeEntry, TypeRegistry,
} from './domain/object-types';
export {
  objectDescriptor, iconForNode, isContainerType, showsInWorkTree,
  isOpenableObjectType, isFindableType, contentKindOf, creatableTypes,
  defaultProps, makeRegistry, BUILTIN_REGISTRY, routeForNode, objectLink,
} from './domain/object-types';
export * from './domain/ids';
export * from './domain/errors';

// ── Format helpers ────────────────────────────────────────────────────────────
export * from './format/format';
export * from './format/emoji';
export * from './format/relative-time';

// ── Search / misc ─────────────────────────────────────────────────────────────
export * from './search-match';
export * from './legal';

// ── User-preferences ─────────────────────────────────────────────────────────
export * from './mutes';
export * from './reads';
export * from './quick-reactions-settings';
export * from './ai-settings';

// ── Starfish in-memory state ──────────────────────────────────────────────────
export * from './spaces-prime';
export * from './invite-preview';
export * from './live-sync-bus';

// ── Blocks (editor vocabulary) ────────────────────────────────────────────────
export * from './blocks';

// ── Content models (WAL/CRDT) ─────────────────────────────────────────────────
export * from './object-content-model';
export * from './page-content';
export * from './comments-content';
export * from './board-content';
export * from './task-model';

// ── Starfish sync layer ───────────────────────────────────────────────────────

// Identity / session (file kept — imported by starfish/stream-bots.ts)
export * from './starfish/identity';

// Client helpers + node-access resolver (merged; openEncryptor/buildEncryptor/ownerEnsureKeyring
// appear in both shims — exported once here; ownerTrustedAdders is covered by identity above)
export {
  makeClient,
  capProviderFor,
  readProfile,
  readPseudo,
  readProfiles,
  writeProfile,
  writePseudo,
  ensureProfileKeys,
  buildAuthHeaders,
  ensurePseudo,
  openEncryptor,
  buildEncryptor,
  ownerEnsureKeyring,
  SpaceAccessError,
  getSpaceClient,
  getNodeAccess,
  buildNodeAccess,
  clearNodeAccessCache,
} from '@drakkar.software/octospaces-sdk';
export type {
  DeviceKeys,
  PublicProfile,
  NodeAccessHandle,
} from '@drakkar.software/octospaces-sdk';

// Device pairing
export {
  startDevicePairing,
  completeDevicePairing,
  PAIR_PREFIX,
} from '@drakkar.software/octospaces-sdk';
export type { PairResult } from '@drakkar.software/octospaces-sdk';

// Space membership + node membership
export {
  makeJoinRequest,
  inviteToSpace,
  acceptSpaceInvite,
  encodeSpaceInviteLink,
  decodeSpaceInviteLink,
  createSpaceInviteLink,
  joinSpaceByLink,
  recoverSpaceAccess,
  addDeviceToSpaceKeyring,
  createNode,
  setNodeAccess,
  inviteToNode,
  acceptNodeInvite,
  createNodeInviteLink,
  decodeNodeInviteLink,
  encodeNodeInviteLink,
  joinNodeByLink,
} from '@drakkar.software/octospaces-sdk';
export type {
  JoinRequest,
  SpaceInviteLinkToken,
  CreateNodeInput,
  NodeInviteBundle,
  NodeInviteLinkToken,
} from '@drakkar.software/octospaces-sdk';

// Member-cap shims + canonical store API (file kept — defines getMemberCap)
export * from './starfish/member-caps';

// Object index
export {
  pushIndexSeed,
  seedSpaceObjectIndex,
  updateObjectIndex,
  readObjectTree,
} from '@drakkar.software/octospaces-sdk';

// Registry
export {
  readSpaces,
  updateSpacesDoc,
  updateMutesDoc,
  updateReadsDoc,
  updateDmsDoc,
  updateQuickReactionsDoc,
  updateArchivedDmsDoc,
  setDmMapping,
  writeSpaces,
  reorderSpaces,
  readSpaceAccess,
  writeSpaceAccess,
  addSpaceMember,
  removeSpaceMember,
  addJoinedSpace,
  addJoinedSpaceWithCap,
  addJoinedSpaceWithLinkAccess,
  createSpace,
  reconcileSpaceMeta,
  onSpaceMeta,
  broadcastSpaceMeta,
} from '@drakkar.software/octospaces-sdk';
export type { SpaceMeta, SpaceMetaUpdate } from '@drakkar.software/octospaces-sdk';
export * from './starfish/registry-ext';

// Objects / object tree (octospaces core)
export {
  buildTree,
  breadcrumbs,
  ancestors,
  subtreeIds,
  nextOrder,
  addObject,
  patchObject,
  reparentObject,
  reorderObjects,
  archiveObject,
} from '@drakkar.software/octospaces-sdk';
export type { ObjectTreeNode, NewObjectInput } from '@drakkar.software/octospaces-sdk';

// Vault-specific object extensions (props/automation in meta)
export * from './starfish/objects-ext';

// User-defined types store — re-export PropKind/EditorKind under aliases to avoid
// shadowing the same names in domain/object-types (both unions are identical, but
// TypeScript requires exactly one name per barrel entry).
export type {
  ContentKind,
  SelectOption,
  FieldDef,
  TypeDef,
  TypesDoc,
} from './starfish/object-types-store';
export type {
  PropKind as StoresPropKind,
  EditorKind as StoresEditorKind,
} from './starfish/object-types-store';
export {
  EMPTY_TYPES_DOC,
  addType, patchType,
  addField, patchField, removeField, reorderFields,
  archiveType,
} from './starfish/object-types-store';

// Blob uploads
export type { ObjectBlobRef, ObjectBlobStore } from '@drakkar.software/octospaces-sdk';
export {
  MAX_OBJECT_BLOB_BYTES,
  FileTooLargeError,
  uploadObjectBlob,
  loadObjectBlob,
  createObjectBlobStore,
} from '@drakkar.software/octospaces-sdk';

// Attachments / crypto helpers (attachment file kept — local createAttachmentStore singleton)
export * from './starfish/attachments';
// account-seal kept as a file — imported by starfish/stream-bots.ts
export * from './starfish/account-seal';
export { starfishBase64, toBase64Url, fromBase64Url } from '@drakkar.software/octospaces-sdk';
export { fetchWithTimeout, CONNECT_TIMEOUT_MS } from '@drakkar.software/octospaces-sdk';

// Paths / scopes
export {
  OBJECT_COLLECTIONS,
  ownerScope,
  spaceMemberScope,
  nodeMemberScope,
  accountScope,
  linkedDeviceScope,
  keyringName,
  keyringPull,
  keyringPush,
  profilePull,
  profilePush,
  spacesPull,
  spacesPush,
  spaceAccessPull,
  spaceAccessPush,
  objIndexPull,
  objIndexPush,
  objLogPull,
  objLogPush,
  objDocPull,
  objDocPush,
  objectBlobPull,
  objectBlobPush,
  objPubName,
  objPubPull,
  objPubPush,
  objInvName,
  objInvPull,
  objInvPush,
  typesIndexPull,
  typesIndexPush,
  objectDirName,
  objectDirPull,
  readObjectDirectory,
  parseObjectDirectoryDoc,
  userIdFromEdPub,
  bytesToHex,
  spaceIdFromRoomId,
  objIndexName,
  objLogName,
  objDocName,
  objectBlobName,
  typesIndexName,
} from '@drakkar.software/octospaces-sdk';
export type { PublicObjectDirEntry } from '@drakkar.software/octospaces-sdk';

// Session / cache
export { sessionFromPersisted, activeAccountOf } from '@drakkar.software/octospaces-sdk';
export { cacheProfile, loadCachedProfile } from '@drakkar.software/octospaces-sdk';
export { pullCache, PULL_CACHE_MAX_AGE_MS } from '@drakkar.software/octospaces-sdk';

// Stream bots (app-specific)
export * from './starfish/stream-bots';

// SSE events transport
export {
  buildSignedEventsRequest,
  parseSseFrames,
  subscribeChanges,
} from '@drakkar.software/octospaces-sdk';
export type { SubscribeChangesOptions } from '@drakkar.software/octospaces-sdk';

// WAL document factory
export type { CreateWalDocumentOptions } from '@drakkar.software/octospaces-sdk/wal';
export {
  WalDocument,
  createWalDocument,
  createWalTransport,
  createWalSnapshotStore,
  walEncryptorFromKeyring,
  walSignerFromKeys,
  noopEncryptor,
} from '@drakkar.software/octospaces-sdk/wal';

// Storage types (platform-agnostic; implementations live in ./platform)
export type {
  DerivedIdentity,
  PersistedSession,
  Vault,
  UnlockMethod,
  PasskeyEnrollment,
  SeedLock,
  VaultLoad,
} from '@drakkar.software/octospaces-sdk';
