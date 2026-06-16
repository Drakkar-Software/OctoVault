import {
  createObjectBlobStore,
  attachmentKind,
  type ObjectBlobRef,
  type ObjectBlobStore,
  type ByteSealer,
} from '@drakkar.software/octospaces-sdk';
import type { StarfishClient } from '@drakkar.software/starfish-client';

export type { ByteSealer } from '@drakkar.software/octospaces-sdk';
export { attachmentKind } from '@drakkar.software/octospaces-sdk';

export interface AttachmentRef extends ObjectBlobRef {
  kind: 'image' | 'file';
}

const _objStore: ObjectBlobStore = createObjectBlobStore({
  persistPrefix: 'octovault.attach.blob.',
  persistIndex: 'octovault.attach.index',
});

export async function uploadAttachment(
  client: StarfishClient,
  enc: ByteSealer | null,
  spaceId: string,
  bytes: Uint8Array,
  name: string,
  mime: string,
): Promise<AttachmentRef> {
  const ref = await _objStore.uploadObjectBlob(client, enc, spaceId, bytes, name, mime);
  return { ...ref, kind: attachmentKind(mime) };
}

export async function loadAttachment(
  client: StarfishClient,
  enc: ByteSealer | null,
  spaceId: string,
  ref: AttachmentRef,
): Promise<Uint8Array> {
  return _objStore.loadObjectBlob(client, enc, spaceId, ref);
}

export function clearAttachmentCache(): void {
  _objStore.clearObjectBlobCache();
}
