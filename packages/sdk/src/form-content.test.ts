import { describe, it, expect } from 'vitest';
import {
  WalDocument,
  createEd25519Signer,
  noopEncryptor,
  type WalTransport,
  type WalAppendElement,
} from '@drakkar.software/starfish-wal';
import { ed25519Suite } from '@drakkar.software/starfish-protocol';

import * as c from './form-content';

/** A minimal in-memory append log shared by every doc opened against it — lets two
 *  replicas exchange ops (commit → pull) so convergence is exercised end-to-end. */
function memTransport(): WalTransport {
  const store = new Map<string, WalAppendElement[]>();
  return {
    async append(key, body) {
      const arr = store.get(key) ?? [];
      const ts = (arr.length ? arr[arr.length - 1]!.ts : 0) + 1;
      arr.push({ ts, data: body.data, authorPubkey: body.authorPubkey, authorSignature: body.authorSignature });
      store.set(key, arr);
      return { ts };
    },
    async pull(key, checkpoint) {
      return (store.get(key) ?? []).filter((e) => e.ts > checkpoint).map((e) => ({ ...e }));
    },
  };
}

async function openDoc(transport: WalTransport, documentKey = 'form__doc'): Promise<WalDocument> {
  const { privHex, pubHex } = ed25519Suite.generateSignerKeypair();
  const doc = new WalDocument({
    documentKey,
    transport,
    signer: createEd25519Signer(pubHex, privHex),
    encryptor: noopEncryptor,
  });
  await doc.open();
  return doc;
}

describe('addField / readFields', () => {
  it('adds a field and reads it back with the correct kind', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addField(doc, { kind: 'email', label: 'Email address' });
    const fields = c.readFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ id, label: 'Email address', kind: 'email', required: false, options: [] });
  });

  it('defaults kind to text when not specified', async () => {
    const doc = await openDoc(memTransport());
    c.addField(doc);
    const fields = c.readFields(doc);
    expect(fields[0]!.kind).toBe('text');
  });
});

describe('moveField', () => {
  it('reorders fields correctly', async () => {
    const doc = await openDoc(memTransport());
    const a = c.addField(doc, { label: 'A' });
    const b = c.addField(doc, { label: 'B' });
    const d = c.addField(doc, { label: 'C' });
    // Move A (index 0) to end (index 3 → clamped to 2)
    c.moveField(doc, a, 3);
    const ids = c.readFields(doc).map((f) => f.id);
    expect(ids).toEqual([b, d, a]);
  });
});

describe('deleteField', () => {
  it('removes a field from the list', async () => {
    const doc = await openDoc(memTransport());
    const a = c.addField(doc, { label: 'Keep' });
    const b = c.addField(doc, { label: 'Remove' });
    c.deleteField(doc, b);
    const fields = c.readFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.id).toBe(a);
  });
});

describe('patchField', () => {
  it('updates kind, required, and options', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addField(doc, { kind: 'text', label: 'Color' });
    const opts = [{ id: 'red', label: 'Red' }, { id: 'blue', label: 'Blue' }];
    c.patchField(doc, id, { kind: 'select', required: true, options: opts });
    const fields = c.readFields(doc);
    expect(fields[0]).toMatchObject({ kind: 'select', required: true, options: opts });
  });
});

describe('addResponse / readResponses', () => {
  it('adds a response and reads it back', async () => {
    const doc = await openDoc(memTransport());
    const data = { name: 'Alice', score: 42 };
    const id = c.addResponse(doc, 'user-a', data, 5000);
    const responses = c.readResponses(doc);
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ id, submitter: 'user-a', submittedAt: 5000, data });
  });
});

describe('convergence across two replicas', () => {
  it('merges fields added concurrently from two replicas', async () => {
    const transport = memTransport();
    const a = await openDoc(transport);
    const b = await openDoc(transport);

    c.addField(a, { label: 'From A' });
    c.addField(b, { label: 'From B' });
    await a.commit();
    await b.commit();
    await a.pull();
    await b.pull();

    const labelsA = c.readFields(a).map((f) => f.label).sort();
    const labelsB = c.readFields(b).map((f) => f.label).sort();
    expect(labelsA).toEqual(['From A', 'From B']);
    expect(labelsB).toEqual(['From A', 'From B']);
  });
});
