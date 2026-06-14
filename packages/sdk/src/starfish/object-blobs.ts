/**
 * Encrypted blob upload/download for object files and images.
 *
 * Mirrors the `attachments.ts` pipeline but keyed by SPACE rather than room:
 * blobs live at `spaces/{spaceId}/objects/blobs/{blobId}` and are sealed with
 * the space keyring CEK. The `objectBlobName` is bound into the seal's AAD so a
 * relocated blob fails to open.
 *
 * Session cache + persisted ciphertext layer are intentionally omitted here; the
 * blob id is stored in the object's `props.blobId` — callers may add their own
 * caching layer if needed.
 */
import type { StarfishClient } from '@drakkar.software/starfish-client';

import type { ByteSealer } from './attachments';
import { objectBlobName, objectBlobPull, objectBlobPush } from './paths';
import { randomId } from '../domain/ids';

/**
 * Maximum allowed byte size for a single object blob upload.
 * Keep in sync with `maxBodyBytes` for the `objblob` collection in
 * `apps/server/src/config.ts` — both must be the same value.
 */
export const MAX_OBJECT_BLOB_BYTES = 11_534_336; // ~11 MB

/** Thrown when a file exceeds {@link MAX_OBJECT_BLOB_BYTES} before any upload attempt. */
export class FileTooLargeError extends Error {
  readonly size: number;
  readonly max: number;
  constructor(size: number, max: number) {
    super(`File is ${size} bytes — maximum allowed is ${max} bytes`);
    this.name = 'FileTooLargeError';
    this.size = size;
    this.max = max;
  }
}

export interface ObjectBlobRef {
  blobId: string;
  name: string;
  mime: string;
  size: number;
}

/** Seal and upload bytes as an object blob; returns the ref to store in node props.
 *  Throws {@link FileTooLargeError} if `bytes` exceeds {@link MAX_OBJECT_BLOB_BYTES}. */
export async function uploadObjectBlob(
  client: StarfishClient,
  enc: ByteSealer,
  spaceId: string,
  bytes: Uint8Array,
  name: string,
  mime: string,
): Promise<ObjectBlobRef> {
  // Defense-in-depth: callers should check size before reading file bytes,
  // but guard here too in case bytes are constructed without a prior size check.
  if (bytes.length > MAX_OBJECT_BLOB_BYTES) {
    throw new FileTooLargeError(bytes.length, MAX_OBJECT_BLOB_BYTES);
  }
  const blobId = randomId();
  const sealed = await enc.sealBytes(bytes, objectBlobName(spaceId, blobId));
  await client.pushBlob(objectBlobPush(spaceId, blobId), sealed, 'application/octet-stream');
  return { blobId, name, mime, size: bytes.length };
}

/** Fetch + decrypt an object blob back to its original bytes. */
export async function loadObjectBlob(
  client: StarfishClient,
  enc: ByteSealer,
  spaceId: string,
  blobId: string,
): Promise<Uint8Array> {
  const res = await client.pullBlob(objectBlobPull(spaceId, blobId));
  const sealed = new Uint8Array(res.data);
  return enc.openBytes(sealed, objectBlobName(spaceId, blobId));
}
