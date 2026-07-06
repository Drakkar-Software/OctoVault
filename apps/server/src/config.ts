import type { SyncConfig } from "@drakkar.software/starfish-server";

/**
 * Starfish collection layout for OctoVault — a Notion/Anytype-style knowledge app
 * (NOT a chat app). ALL content lives in a GENERIC per-object family:
 *
 *   objlog / objsnap  — WAL/CRDT append-only op-log (append) + sibling LWW snapshot
 *                        for every Object with contentKind "append" (pages, boards,
 *                        tasks, …). Folded client-side by @drakkar.software/starfish-wal.
 *   objdoc            — LWW merge-doc for Objects with contentKind "merge" (record-form
 *                        custom types, file captions, …).
 *   objblob           — raw sealed binary blobs for file/image Objects.
 *   objindex          — union-merged tree index (all Objects in a space). PLAINTEXT —
 *                        invite-node titles/emoji stripped client-side before storage.
 *   objpub            — public node content (access:'public'): world-readable plaintext.
 *   objinv            — invite-only plaintext content (access:'invite'+enc:false): gated
 *                        by per-node cap via the sharing plugin, NOT space:member.
 *   typeindex         — union-merged per-space custom-type registry.
 *   spacekeyring      — space-wide multi-recipient keyring: ONE keyring per space
 *                        encrypts ALL enc nodes in that space.
 *
 * The access record lives at spaces/{spaceId}/_access (collection spaceregistry).
 *
 *   {identity}   - resolver enforces it equals the cap-bound user id
 *   {objectId} / {blobId} / {spaceId} / {nodeId} / {rendezvousId} - free path params
 *
 * Keep in sync with packages/sdk/src/starfish/paths.ts (OBJECT_COLLECTIONS)
 * AND Infra/sync/server/drakkar_sync/apps/octovault/collections.py — they are mirrors.
 */
const JSON_ONLY = ["application/json"];

export const config: SyncConfig = {
  version: 1,
  collections: [
    // SPACE-wide multi-recipient keyring: one keyring (CEK) per space. ONE keyring
    // encrypts ALL enc nodes in the space. READ gated on `space:member`, WRITE on
    // `space:owner` — both synthesized by the space-role enricher from the access
    // record below.
    {
      name: "spacekeyring",
      storagePath: "spaces/{spaceId}/_keyring",
      readRoles: ["space:member"],
      writeRoles: ["space:owner"],
      encryption: "none",
      maxBodyBytes: 65_536,
      allowedMimeTypes: JSON_ONLY,
    },
    // SPACE access record `{ owner, members:[…] }`. READ gated on `space:member`,
    // WRITE on `space:owner`. The space-role enricher reads THIS doc to synthesize
    // space:member / space:owner for every other collection.
    {
      name: "spaceregistry",
      storagePath: "spaces/{spaceId}/_access",
      readRoles: ["space:member"],
      writeRoles: ["space:owner"],
      encryption: "none",
      maxBodyBytes: 131_072,
      allowedMimeTypes: JSON_ONLY,
    },
    // OBJECT TREE (plaintext, member-gated): the union-merged list of every Object in
    // a space. Titles/emoji of `invite` nodes are stripped client-side before storage.
    // WRITE is `space:member` (any member creates pages/boards/folders).
    {
      name: "objindex",
      storagePath: "spaces/{spaceId}/objects/_index",
      readRoles: ["space:member"],
      writeRoles: ["space:member"],
      encryption: "none",
      maxBodyBytes: 262_144,
      allowedMimeTypes: JSON_ONLY,
    },
    // PUBLIC NODE CONTENT (access:'public'): world-readable plaintext merge-doc. Any
    // anonymous caller may GET it; WRITE is `space:member` (the owner/members publish
    // content here). The server never validates the content; the client reads it openly.
    {
      name: "objpub",
      storagePath: "spaces/{spaceId}/objects/pub/{nodeId}",
      readRoles: ["public"],
      writeRoles: ["space:member"],
      encryption: "none",
      maxBodyBytes: 262_144,
      allowedMimeTypes: JSON_ONLY,
    },
    // INVITE-ONLY PLAINTEXT CONTENT (access:'invite'+enc:false): gated by the per-node
    // cap via the sharing plugin path-match — NOT by space:member. The collection has no
    // broad role rules; access is entirely cap-scope (objinv + path) controlled.
    {
      name: "objinv",
      storagePath: "spaces/{spaceId}/objects/n/{nodeId}/content",
      readRoles: [],
      writeRoles: [],
      encryption: "none",
      maxBodyBytes: 262_144,
      allowedMimeTypes: JSON_ONLY,
    },
    // GENERIC WAL snapshot (private/E2EE): sibling LWW `<objlog>__snapshot`. Registered
    // BEFORE `objlog` so the more-specific `{objectId}__snapshot` route is matched first;
    // plain log pulls (no `__snapshot` suffix) fall through to `objlog`. Materialized
    // `state` is sealed by the WAL encryptor INSIDE the doc, so the collection itself is
    // `none` (plaintext uptoTs/writerSeq/producedBy + a signature). NOT queued — readers
    // resume from the log.
    {
      name: "objsnap",
      storagePath: "spaces/{spaceId}/objects/logs/{objectId}__snapshot",
      readRoles: ["space:member"],
      writeRoles: ["space:member"],
      encryption: "none",
      maxBodyBytes: 1_048_576,
      allowedMimeTypes: JSON_ONLY,
    },
    // GENERIC WAL op-log (private/E2EE): one append-only `by_timestamp` log per Object
    // with contentKind "append" (pages, tasks, boards-view, …). Each element is a sealed
    // CRDT op-batch folded client-side by starfish-wal. `requireAuthorSignature` so every
    // op is Ed25519 author-verified before fold. NO `ttlMs` (a TTL would expire a quiet
    // object's whole log). `objects/logs/` subtree (sibling of `_index` leaf + `docs/` +
    // `blobs/`) keeps the file-vs-directory rule. Keep in sync with objLogName in
    // apps/mobile/src/lib/starfish/paths.ts AND Infra collections.py.
    {
      name: "objlog",
      storagePath: "spaces/{spaceId}/objects/logs/{objectId}",
      readRoles: ["space:member"],
      writeRoles: ["space:member"],
      encryption: "delegated",
      appendOnly: { type: "by_timestamp", requireAuthorSignature: true },
      maxBodyBytes: 262_144,
      allowedMimeTypes: JSON_ONLY,
    },
    // GENERIC merge-doc (private/E2EE): LWW last-writer-wins doc per Object with
    // contentKind "merge" (record-form custom-type objects, file/image caption metadata,
    // …). No appendOnly — the whole doc is replaced on each write and merged by the
    // union-merge engine client-side.
    {
      name: "objdoc",
      storagePath: "spaces/{spaceId}/objects/docs/{objectId}",
      readRoles: ["space:member"],
      writeRoles: ["space:member"],
      encryption: "delegated",
      maxBodyBytes: 262_144,
      allowedMimeTypes: JSON_ONLY,
    },
    // GENERIC raw blob (sealed client-side): binary file/image bytes sealed with the space
    // keyring CEK before upload; the server stores opaque ciphertext. `none` encryption at
    // the collection level because the blob is already client-sealed (AAD = objectBlobName
    // path). Large maxBodyBytes to match the roleResolver ceiling in index.ts.
    {
      name: "objblob",
      storagePath: "spaces/{spaceId}/objects/blobs/{blobId}",
      readRoles: ["space:member"],
      writeRoles: ["space:member"],
      encryption: "none",
      maxBodyBytes: 11_534_336,
      allowedMimeTypes: ["application/octet-stream"],
    },
    // PER-SPACE CUSTOM TYPE REGISTRY (private/E2EE): union-merged list of user-defined
    // TypeDefs — icon, label, fields, editorKind. Merged with built-in type descriptors
    // client-side. Same access model as objindex. `types/` subtree (sibling of `objects/`)
    // keeps the file-vs-directory rule. Keep in sync with typesIndexName in paths.ts AND
    // Infra collections.py.
    {
      name: "typeindex",
      storagePath: "spaces/{spaceId}/types/_index",
      readRoles: ["space:member"],
      writeRoles: ["space:member"],
      encryption: "delegated",
      maxBodyBytes: 262_144,
      allowedMimeTypes: JSON_ONLY,
    },
    // Public-readable profile; only the self-signed root device may write.
    {
      name: "profile",
      storagePath: "user/{identity}/profile",
      readRoles: ["public"],
      writeRoles: ["device:root"],
      encryption: "none",
      maxBodyBytes: 65_536,
      allowedMimeTypes: JSON_ONLY,
    },
    // Per-identity device directory.
    {
      name: "devices",
      storagePath: "users/{identity}/_devices",
      readRoles: ["cap:read:devices"],
      writeRoles: ["cap:write:devices"],
      encryption: "none",
      maxBodyBytes: 131_072,
      allowedMimeTypes: JSON_ONLY,
    },
    // Per-identity space registry.
    {
      name: "spaces",
      storagePath: "user/{identity}/_spaces",
      readRoles: ["cap:read:spaces"],
      writeRoles: ["cap:write:spaces"],
      encryption: "none",
      maxBodyBytes: 131_072,
      allowedMimeTypes: JSON_ONLY,
    },
    // GLOBAL PUBLIC OBJECT DIRECTORY: a server-maintained list document indexing every
    // public node (`access:'public'`) across all spaces, written ONLY by the
    // `starfish-projection` plugin (see projections.ts). On each `objindex` write the
    // projection upserts that space's `{ nodes:[{id,title,type,emoji?,updatedAt}], ts }`
    // or removes the entry when the space has no public nodes. Anonymous callers may pull
    // it to discover public content. `pullOnly` rejects all client writes.
    // Keep in sync with objectDirName in @drakkar.software/dk-spaces-sdk (paths.ts)
    // AND drakkar_sync/apps/octovault/collections.py.
    {
      name: "objectindex",
      storagePath: "_index/objects/{shard}",
      readRoles: ["public"],
      writeRoles: [],
      pullOnly: true,
      encryption: "none",
      maxBodyBytes: 262_144,
      allowedMimeTypes: JSON_ONLY,
    },
    // Anonymous rendezvous slot for QR device pairing.
    {
      name: "pairing",
      storagePath: "_pairing/{rendezvousId}",
      readRoles: ["public"],
      writeRoles: ["public"],
      encryption: "none",
      maxBodyBytes: 16_384,
      allowedMimeTypes: JSON_ONLY,
    },
  ],
};
