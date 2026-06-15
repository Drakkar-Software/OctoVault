/**
 * Tests for OctoVault's uploadAttachment / loadAttachment (always-enc, E2EE only).
 * Pins behavior and guards against regressions when the attachment pipeline changes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureKv } from '../config/kv';
import {
  attachmentKind,
  clearAttachmentCache,
  loadAttachment,
  uploadAttachment,
  type AttachmentRef,
  type ByteSealer,
} from './attachments';

// ── In-memory KV ──────────────────────────────────────────────────────────────

let store: Map<string, string>;

beforeEach(() => {
  store = new Map<string, string>();
  configureKv({
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => void store.set(k, v),
    remove: async (k) => void store.delete(k),
  });
  clearAttachmentCache();
  vi.clearAllMocks();
});

// ── Fake StarfishClient ────────────────────────────────────────────────────────

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

// ── Fake ByteSealer ───────────────────────────────────────────────────────────
// XOR with 0xFF so seal(seal(x)) === x and seal(x) !== x for non-zero bytes.

const fakeSealer: ByteSealer = {
  sealBytes: vi.fn(async (bytes: Uint8Array) => {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ 0xff;
    return out;
  }),
  openBytes: vi.fn(async (bytes: Uint8Array) => {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ 0xff;
    return out;
  }),
};

const BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const SEALED = new Uint8Array([1 ^ 0xff, 2 ^ 0xff, 3 ^ 0xff, 4 ^ 0xff, 5 ^ 0xff]);

// ── attachmentKind ─────────────────────────────────────────────────────────────

describe('attachmentKind', () => {
  it('image/* MIME types resolve to "image"', () => {
    expect(attachmentKind('image/png')).toBe('image');
    expect(attachmentKind('image/jpeg')).toBe('image');
    expect(attachmentKind('image/webp')).toBe('image');
  });

  it('non-image MIME types resolve to "file"', () => {
    expect(attachmentKind('application/pdf')).toBe('file');
    expect(attachmentKind('text/plain')).toBe('file');
    expect(attachmentKind('video/mp4')).toBe('file');
  });
});

// ── uploadAttachment ──────────────────────────────────────────────────────────

describe('uploadAttachment', () => {
  it('seals the blob before storing (stored bytes differ from plaintext)', async () => {
    const client = makeFakeClient();
    const ref: AttachmentRef = await uploadAttachment(
      client as never, fakeSealer, 'room-1', BYTES, 'test.png', 'image/png',
    );
    expect(fakeSealer.sealBytes).toHaveBeenCalledOnce();
    // The bytes on the server must be the SEALED form, not the plaintext.
    const storedPath = [...client.blobs.keys()][0]!;
    expect(client.blobs.get(storedPath)).toEqual(SEALED);
    expect(ref.name).toBe('test.png');
    expect(ref.mime).toBe('image/png');
    expect(ref.size).toBe(5);
    expect(ref.kind).toBe('image');
  });

  it('returns the correct AttachmentRef fields', async () => {
    const client = makeFakeClient();
    const ref = await uploadAttachment(
      client as never, fakeSealer, 'room-1', BYTES, 'doc.pdf', 'application/pdf',
    );
    expect(ref.kind).toBe('file');
    expect(ref.blobId).toMatch(/^[0-9a-f]{32}$/);
    expect(ref.size).toBe(BYTES.length);
  });
});

// ── loadAttachment ────────────────────────────────────────────────────────────

describe('loadAttachment', () => {
  it('round-trips: upload then load returns original plaintext bytes', async () => {
    const client = makeFakeClient();
    const ref = await uploadAttachment(
      client as never, fakeSealer, 'room-1', BYTES, 'test.txt', 'text/plain',
    );
    clearAttachmentCache(); // force a cold load
    const loaded = await loadAttachment(client as never, fakeSealer, 'room-1', ref);
    expect(loaded).toEqual(BYTES);
    expect(fakeSealer.openBytes).toHaveBeenCalledOnce();
  });

  it('serves from in-memory cache on the second call (no network pull)', async () => {
    const client = makeFakeClient();
    const ref = await uploadAttachment(
      client as never, fakeSealer, 'room-1', BYTES, 'a.png', 'image/png',
    );
    const first = await loadAttachment(client as never, fakeSealer, 'room-1', ref);
    const second = await loadAttachment(client as never, fakeSealer, 'room-1', ref);
    expect(first).toEqual(BYTES);
    expect(second).toEqual(BYTES);
    // pullBlob never needed — upload seeded in-memory cache; second load is a hit.
    expect(client.pullBlob).not.toHaveBeenCalled();
  });

  it('falls back to KV persistence on cache miss (no network pull)', async () => {
    const client = makeFakeClient();
    const ref = await uploadAttachment(
      client as never, fakeSealer, 'room-2', BYTES, 'b.txt', 'text/plain',
    );
    clearAttachmentCache(); // evict the sender's own in-memory entry
    const loaded = await loadAttachment(client as never, fakeSealer, 'room-2', ref);
    // Served from KV — no network pull required.
    expect(client.pullBlob).not.toHaveBeenCalled();
    expect(loaded).toEqual(BYTES);
  });

  it('falls back to network pull when both cache and KV miss', async () => {
    const client = makeFakeClient();
    // Pre-seed the "server" with a sealed blob (simulate: another device uploaded it,
    // so this client's KV and in-memory cache are both cold). The pull path is what
    // loadAttachment requests; we seed it directly so pullBlob can return it.
    const blobId = 'deadbeefcafebabe0123456789abcdef';
    const pullPath = `/pull/spaces/room-3/attachments/room-3/${blobId}`;
    client.blobs.set(pullPath, SEALED);

    const ref: AttachmentRef = { blobId, name: 'c.png', mime: 'image/png', size: 5, kind: 'image' };
    const loaded = await loadAttachment(client as never, fakeSealer, 'room-3', ref);
    expect(client.pullBlob).toHaveBeenCalledOnce();
    expect(loaded).toEqual(BYTES);
  });
});

// ── AAD binding ───────────────────────────────────────────────────────────────

describe('AAD binding', () => {
  it('sealBytes is called with the attachment storage path as AAD', async () => {
    const client = makeFakeClient();
    const ref = await uploadAttachment(
      client as never, fakeSealer, 'sp-abc-room1', BYTES, 'f.bin', 'application/octet-stream',
    );
    const [[, aad]] = vi.mocked(fakeSealer.sealBytes).mock.calls;
    // The AAD should be the attachment storage path (bound into the seal).
    expect(aad).toContain('sp-abc');
    expect(aad).toContain(ref.blobId);
  });
});
