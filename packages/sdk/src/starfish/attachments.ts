/**
 * OctoVault attachment layer, backed by the `objblob` collection
 * (`spaces/{spaceId}/objects/blobs/{blobId}`) via starfish-client's
 * `createSealedBlobStore`, fed dk-spaces-sdk's `objectBlobPaths` path/AAD
 * strategy. Blobs are keyed by SPACE, sealed client-side before upload, and
 * cached in memory + KV for offline reads.
 *
 * Public API is kept stable (same names/types as the legacy attachment store)
 * so callers need no changes to imports. dk-spaces-sdk 0.30 stopped wrapping
 * the blob store — this module now builds it directly and re-attaches the
 * `name`/`mime`/`kind` metadata the new generic store no longer tracks (its
 * `upload`/`load` only take raw bytes + id).
 */
import { createSealedBlobStore, type ByteSealer } from '@drakkar.software/starfish-client';
import { objectBlobPaths, MAX_OBJECT_BLOB_BYTES, attachmentKind, kvGet, kvSet, kvRemove, type ObjectBlobRef, type BlobCtx } from '@drakkar.software/dk-spaces-sdk';
import type { StarfishClient } from '@drakkar.software/starfish-client';

// ── Public re-exports (kept stable for callers) ────────────────────────────
export type { ByteSealer } from '@drakkar.software/starfish-client';
export { attachmentKind } from '@drakkar.software/dk-spaces-sdk';

export interface AttachmentRef extends ObjectBlobRef {
  kind: 'image' | 'file';
}

// ── Singleton store (stable KV prefixes across the app) ───────────────────
const _blobStore = createSealedBlobStore<BlobCtx>({
  paths: objectBlobPaths,
  maxBytes: MAX_OBJECT_BLOB_BYTES,
  kvAdapter: { getItem: kvGet, setItem: kvSet, removeItem: kvRemove },
  persistPrefix: 'octovault.attach.blob.',
  persistIndexKey: 'octovault.attach.index',
});

export async function uploadAttachment(
  client: StarfishClient,
  enc: ByteSealer | null,
  spaceId: string,
  bytes: Uint8Array,
  name: string,
  mime: string,
): Promise<AttachmentRef> {
  const blobId = await _blobStore.upload(client, enc, bytes, { spaceId });
  return { blobId, name, mime, size: bytes.length, kind: attachmentKind(mime) };
}

export async function loadAttachment(
  client: StarfishClient,
  enc: ByteSealer | null,
  spaceId: string,
  ref: AttachmentRef,
): Promise<Uint8Array> {
  return _blobStore.load(client, enc, ref.blobId, { spaceId });
}

export function clearAttachmentCache(): void {
  _blobStore.clearCache();
}
