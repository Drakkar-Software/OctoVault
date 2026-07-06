// @drakkar.software/octovault-sdk
// Pure, React-free logic for OctoVault: crypto/identity, Starfish sync, WAL/CRDT
// document models, data registries, pure helpers.
//
// After the starfish-spaces extraction, the spaces domain (registry, members, nodes,
// identity, keyrings, profiles) comes from `@drakkar.software/starfish-spaces`;
// `@drakkar.software/dk-spaces-sdk` retains config, paths, SSE transport, and search/bus.
// The vault adds its own WAL/CRDT content models and domain descriptors.

// ── Config / DI seams ─────────────────────────────────────────────────────────
export * from './config/config';
export * from './config/kv';

// ── Domain types ──────────────────────────────────────────────────────────────
export type { IconName } from './domain/icon-name';
export type { TextVariant } from './domain/text-variant';
export * from './domain/types';
export * from './domain/capabilities';
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
export * from './table-content';
export * from './task-model';
export * from './calendar-content';
// form-content: addField/patchField/deleteField conflict with the same names in
// starfish/object-types-store; re-export under form-scoped aliases.
export type {
  FormFieldKind,
  FormFieldOption,
  FormField,
  FormResponse,
} from './form-content';
export {
  readFields, readResponses,
  addField as addFormField,
  deleteField as deleteFormField,
  moveField as moveFormField,
  patchField as patchFormField,
  addResponse,
} from './form-content';
export * from './feedback-content';

// ── Starfish sync layer ───────────────────────────────────────────────────────

// Identity / session (wrappers that inject clientOpts into starfish-spaces builders)
export * from './starfish/identity';

// Client helpers: host-aware auth headers, profile/encryptor wrappers, layout
// (merged; openEncryptor/buildEncryptor/ownerEnsureKeyring appear in both shims —
// exported once here)
export {
  capProviderFor,
  readProfile,
  readProfiles,
  writeProfile,
  buildAuthHeaders,
  buildEncryptor,
  ownerEnsureKeyring,
} from './starfish/client';

// Space access store + per-node access (starfish-spaces)
export {
  SpaceAccessError,
  getSpaceClient,
  getNodeAccess,
  clearNodeAccessCache,
  hydrateSpaceAccessStore,
  getSpaceAccessEntry,
  saveSpaceAccessEntry,
  removeSpaceAccessEntry,
  getNodeAccessEntry,
  saveNodeAccessEntry,
  localSpaceAccessEntries,
  memberCapsFromStore,
  linkAccessFromStore,
  type SpaceAccessEntry,
  type SpaceAccessMap,
  type NodeAccess,
} from '@drakkar.software/starfish-spaces';

// Device pairing (local wrapper — starfish alpha.63 made root-trust mandatory on
// pairing completion; see ./starfish/pairing for the confirmUnpinnedRoot decision)
export { startDevicePairing, completeDevicePairing, PAIR_PREFIX } from './starfish/pairing';
export type { PairResult } from './starfish/pairing';

// Space membership + node membership (starfish-spaces)
export {
  makeJoinRequest,
  inviteToSpace,
  acceptSpaceInvite,
  createSpaceInviteLink,
  joinSpaceByLink,
  recoverSpaceAccess,
  createNode,
  inviteToNode,
  joinNodeByLink,
} from '@drakkar.software/starfish-spaces';

// Member-cap shims + canonical store API (file kept — defines getMemberCap)
export * from './starfish/member-caps';

// Registry (starfish-spaces)
// readSpaces is NOT re-exported from starfish-spaces here — registry-ext.ts wraps
// it to re-flatten mutes/reads from extra (SpacesDoc restructure in 0.23+).
export {
  updateSpacesDoc,
  reorderSpaces,
  readSpaceAccess,
  writeSpaceAccess,
  removeSpaceMember,
  createSpace,
  reconcileSpaceMeta,
  onSpaceMeta,
  broadcastSpaceMeta,
} from '@drakkar.software/starfish-spaces';
export type { SpaceMeta, SpaceMetaUpdate } from '@drakkar.software/starfish-spaces';
export * from './starfish/registry-ext';

// Objects / object tree (moved to starfish-spaces in 0.31)
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
} from '@drakkar.software/starfish-spaces';
export type { ObjectTreeNode, NewObjectInput } from '@drakkar.software/starfish-spaces';

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

// Default object-blob store (bare uploadObjectBlob/loadObjectBlob — octospaces-sdk
// 0.31 dropped these; recreated locally, see ./starfish/object-blobs)
export * from './starfish/object-blobs';

// Attachments / crypto helpers (attachment file kept — local createAttachmentStore singleton)
export * from './starfish/attachments';
// account-seal kept as a file — imported by starfish/stream-bots.ts
export * from './starfish/account-seal';
// fetchWithTimeout removed from octospaces-sdk in 0.24 — vendored via starfish-client/fetch.
export { fetchWithTimeout, CONNECT_TIMEOUT_MS } from './starfish/fetch-timeout';

// Paths / scopes (DKSpaces-unique — pure package rename; bytesToHex moved to starfish-protocol)
export {
  OBJECT_COLLECTIONS,
  keyringPull,
  keyringPush,
  objIndexPull,
  objIndexPush,
  objPubPull,
  objPubPush,
  objInvPull,
  objInvPush,
  typesIndexPull,
  typesIndexPush,
  objectDirName,
  objLogName,
  objectBlobName,
  typesIndexName,
} from '@drakkar.software/dk-spaces-sdk';
export { bytesToHex } from '@drakkar.software/starfish-protocol';
// readObjectDirectory / ObjectDirectoryEntry moved from octospaces-sdk to starfish-spaces in 0.24.
// New API: readObjectDirectory(session, shard?) — session provides baseUrl + layout.
// PublicObjectDirEntry alias kept for call-site backwards compat (same shape as ObjectDirectoryEntry).
export { readObjectDirectory, parseObjectDirectoryDoc } from '@drakkar.software/starfish-spaces';
export type { ObjectDirectoryEntry } from '@drakkar.software/starfish-spaces';
export type { ObjectDirectoryEntry as PublicObjectDirEntry } from '@drakkar.software/starfish-spaces';

// Session / cache
export { sessionFromPersisted, activeAccountOf, rootIdentityOf } from './starfish/identity';
// pullCache / PULL_CACHE_MAX_AGE_MS were removed from octospaces-sdk in 0.24 —
// vendored locally via starfish-client's createKvPullCache.
export { pullCache, PULL_CACHE_MAX_AGE_MS } from './starfish/pull-cache';

// Stream bots (app-specific)
export * from './starfish/stream-bots';

// SSE events transport (buildSignedEventsRequest/subscribeChanges are DKSpaces-unique;
// parseSseFrames moved to starfish-client)
export { buildSignedEventsRequest, subscribeChanges } from '@drakkar.software/dk-spaces-sdk';
export type { SubscribeChangesOptions } from '@drakkar.software/dk-spaces-sdk';
export { parseSseFrames } from '@drakkar.software/starfish-client/events';

// WAL document factory — moved from octospaces-sdk/wal (subpath dropped in 0.24).
// WalDocument class/type lives in the root entry; createWalDocument + noopEncryptor
// are the client-side factory exported from the /client subpath.
export { WalDocument } from '@drakkar.software/starfish-wal';
export { createWalDocument, noopEncryptor } from '@drakkar.software/starfish-wal/client';

// Storage types (platform-agnostic; implementations live in ./platform)
// PersistedSession is exported via ./starfish/identity above — not repeated here.
export type {
  DerivedIdentity,
  Vault,
  UnlockMethod,
  PasskeyEnrollment,
  SeedLock,
  VaultLoad,
} from '@drakkar.software/starfish-spaces';
