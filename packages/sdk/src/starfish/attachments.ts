export type { ByteSealer, AttachmentRef, AttachmentStore } from '@drakkar.software/octospaces-sdk';
export { MAX_ATTACHMENT_BYTES, attachmentKind, createAttachmentStore } from '@drakkar.software/octospaces-sdk';

import { createAttachmentStore } from '@drakkar.software/octospaces-sdk';

const _store = createAttachmentStore({
  persistPrefix: 'octovault.attach.blob.',
  persistIndex: 'octovault.attach.index',
});

export const { uploadAttachment, loadAttachment, clearAttachmentCache } = _store;
