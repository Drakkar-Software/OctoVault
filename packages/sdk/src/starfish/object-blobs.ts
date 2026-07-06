/**
 * Default object-blob store — a second, independent `createSealedBlobStore`
 * singleton, in-memory cache only (no KV persistence — matches the old
 * octospaces-sdk default singleton this replaces), previously exposed as bare
 * `uploadObjectBlob`/`loadObjectBlob` functions. Used directly by file/image
 * ObjectNode attachments (see apps/mobile's use-object-files.ts /
 * use-object-blob.ts) — kept separate from ./attachments' custom-prefixed,
 * KV-persisted store so neither store's cache behavior shifts.
 */
import { createSealedBlobStore, FileTooLargeError, type ByteSealer } from '@drakkar.software/starfish-client';
import { objectBlobPaths, MAX_OBJECT_BLOB_BYTES, type ObjectBlobRef, type BlobCtx } from '@drakkar.software/dk-spaces-sdk';
import type { StarfishClient } from '@drakkar.software/starfish-client';

export { FileTooLargeError, MAX_OBJECT_BLOB_BYTES };
export type { ObjectBlobRef };

const _objStore = createSealedBlobStore<BlobCtx>({
  paths: objectBlobPaths,
  maxBytes: MAX_OBJECT_BLOB_BYTES,
});

export async function uploadObjectBlob(
  client: StarfishClient,
  enc: ByteSealer | null,
  spaceId: string,
  bytes: Uint8Array,
  name: string,
  mime: string,
): Promise<ObjectBlobRef> {
  const blobId = await _objStore.upload(client, enc, bytes, { spaceId });
  return { blobId, name, mime, size: bytes.length };
}

export async function loadObjectBlob(
  client: StarfishClient,
  enc: ByteSealer | null,
  spaceId: string,
  blobId: string,
): Promise<Uint8Array> {
  return _objStore.load(client, enc, blobId, { spaceId });
}
