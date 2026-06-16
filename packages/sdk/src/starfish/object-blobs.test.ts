import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FileTooLargeError,
  MAX_OBJECT_BLOB_BYTES,
  uploadObjectBlob,
  loadObjectBlob,
  type ObjectBlobRef,
} from '@drakkar.software/octospaces-sdk';
import type { ByteSealer } from './attachments';

function makeFakeClient() {
  const blobs = new Map<string, Uint8Array>();
  return {
    pushBlob: vi.fn(async (path: string, data: Uint8Array) => void blobs.set(path, data)),
    pullBlob: vi.fn(async (path: string) => {
      const d = blobs.get(path);
      if (!d) throw new Error(`blob not found: ${path}`);
      return { data: d } as unknown as { data: Uint8Array };
    }),
    blobs,
  };
}

const fakeSealer: ByteSealer = {
  sealBytes: vi.fn(async (bytes: Uint8Array, _aad?: string) => {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ 0xff;
    return out;
  }),
  openBytes: vi.fn(async (bytes: Uint8Array, _aad?: string) => {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ 0xff;
    return out;
  }),
};

const BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const SEALED = new Uint8Array([1 ^ 0xff, 2 ^ 0xff, 3 ^ 0xff, 4 ^ 0xff, 5 ^ 0xff]);

beforeEach(() => vi.clearAllMocks());

describe('uploadObjectBlob', () => {
  it('seals bytes with AAD = objectBlobName(spaceId, blobId) and pushes to server', async () => {
    const client = makeFakeClient();
    const ref: ObjectBlobRef = await uploadObjectBlob(client as never, fakeSealer, 'sp-abc', BYTES, 'file.pdf', 'application/pdf');

    expect(fakeSealer.sealBytes).toHaveBeenCalledOnce();
    const [[, aad]] = vi.mocked(fakeSealer.sealBytes).mock.calls;
    expect(aad).toContain('sp-abc');
    expect(aad).toContain(ref.blobId);

    // Server received the SEALED form, not plaintext
    const storedPath = [...client.blobs.keys()][0]!;
    expect(client.blobs.get(storedPath)).toEqual(SEALED);
  });

  it('returns correct ObjectBlobRef fields', async () => {
    const client = makeFakeClient();
    const ref = await uploadObjectBlob(client as never, fakeSealer, 'sp-abc', BYTES, 'img.png', 'image/png');
    expect(ref.name).toBe('img.png');
    expect(ref.mime).toBe('image/png');
    expect(ref.size).toBe(5);
    expect(ref.blobId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('throws FileTooLargeError before sealing when bytes exceed MAX_OBJECT_BLOB_BYTES', async () => {
    const client = makeFakeClient();
    const huge = new Uint8Array(MAX_OBJECT_BLOB_BYTES + 1);
    await expect(uploadObjectBlob(client as never, fakeSealer, 'sp-abc', huge, 'big.bin', 'application/octet-stream'))
      .rejects.toBeInstanceOf(FileTooLargeError);
    expect(fakeSealer.sealBytes).not.toHaveBeenCalled();
    expect(client.pushBlob).not.toHaveBeenCalled();
  });

  it('FileTooLargeError carries size and max', async () => {
    const size = MAX_OBJECT_BLOB_BYTES + 42;
    const err = new FileTooLargeError(size, MAX_OBJECT_BLOB_BYTES);
    expect(err.size).toBe(size);
    expect(err.max).toBe(MAX_OBJECT_BLOB_BYTES);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('loadObjectBlob', () => {
  it('pulls from server, opens with AAD = objectBlobName(spaceId, blobId), returns plaintext', async () => {
    const client = makeFakeClient();
    // Pre-seed the server with the sealed blob at the pull path
    const blobId = 'deadbeefcafebabe0123456789abcdef';
    client.blobs.set(`/pull/spaces/sp-abc/objects/blobs/${blobId}`, SEALED);

    const loaded = await loadObjectBlob(client as never, fakeSealer, 'sp-abc', blobId);
    expect(loaded).toEqual(BYTES);
    expect(fakeSealer.openBytes).toHaveBeenCalledOnce();
    const [[, aad]] = vi.mocked(fakeSealer.openBytes).mock.calls;
    expect(aad).toContain('sp-abc');
    expect(aad).toContain(blobId);
  });

  it('round-trip: upload then load returns original plaintext', async () => {
    const client = makeFakeClient();
    const ref = await uploadObjectBlob(client as never, fakeSealer, 'sp-xyz', BYTES, 'f.bin', 'application/octet-stream');
    vi.clearAllMocks();

    // Re-seed blobs map with pull path (push path ≠ pull path)
    const pushPath = [...client.blobs.keys()][0]!;
    const pullPath = pushPath.replace('/push/', '/pull/');
    client.blobs.set(pullPath, client.blobs.get(pushPath)!);

    const loaded = await loadObjectBlob(client as never, fakeSealer, 'sp-xyz', ref.blobId);
    expect(loaded).toEqual(BYTES);
  });
});
