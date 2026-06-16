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
import { FORM_SCHEMA } from './object-content-model';

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

  it('safeParseJson falls back to [] for malformed options JSON', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addField(doc, { kind: 'select', label: 'Bad opts' });
    // Directly write malformed JSON into the options register to exercise safeParseJson's catch branch
    doc.setField(`foptions:${id}`, '{not valid json[[[');
    const fields = c.readFields(doc);
    expect(fields[0]!.options).toEqual([]);
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

  it('safeParseJson falls back to {} for malformed response data', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addResponse(doc, 'user-b', {}, 1000);
    doc.setField(`rdata:${id}`, 'not-json');
    const responses = c.readResponses(doc);
    expect(responses[0]!.data).toEqual({});
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

  it('concurrent moveField on two replicas converges to a deterministic order', async () => {
    const transport = memTransport();
    const docA = await openDoc(transport);
    const docB = await openDoc(transport);

    // A sets up fields [X, Y, Z] and both sync
    const x = c.addField(docA, { label: 'X' });
    const y = c.addField(docA, { label: 'Y' });
    const z = c.addField(docA, { label: 'Z' });
    await docA.commit();
    await docB.pull();

    // A moves Z to front (index 0); B moves X to end (index 2)
    c.moveField(docA, z, 0); // [Z, X, Y]
    c.moveField(docB, x, 2); // [Y, Z, X]
    await docA.commit();
    await docB.commit();
    await docA.pull();
    await docB.pull();

    // Both replicas must agree on the same order (LWW on the list key)
    const idsA = c.readFields(docA).map((f) => f.id);
    const idsB = c.readFields(docB).map((f) => f.id);
    expect(idsA).toEqual(idsB);
    // All three fields still present
    expect(idsA).toContain(x);
    expect(idsA).toContain(y);
    expect(idsA).toContain(z);
  });

  it('merges responses added concurrently from two replicas', async () => {
    const transport = memTransport();
    const docA = await openDoc(transport);
    const docB = await openDoc(transport);

    c.addResponse(docA, 'alice', { q1: 'yes' }, 1000);
    c.addResponse(docB, 'bob', { q1: 'no' }, 2000);
    await docA.commit();
    await docB.commit();
    await docA.pull();
    await docB.pull();

    const submittersA = c.readResponses(docA).map((r) => r.submitter).sort();
    const submittersB = c.readResponses(docB).map((r) => r.submitter).sort();
    expect(submittersA).toEqual(['alice', 'bob']);
    expect(submittersB).toEqual(['alice', 'bob']);
  });
});

describe('schema guard — FORM_SCHEMA field keys match actual writes', () => {
  it('all keys written by addField/patchField/addResponse match FORM_SCHEMA prefixes', async () => {
    const doc = await openDoc(memTransport());
    const fid = c.addField(doc, { kind: 'select', label: 'Color', required: true, options: [{ id: 'r', label: 'Red' }] });
    c.patchField(doc, fid, { kind: 'email' });
    c.addResponse(doc, 'user-x', { q: 1 }, 9999);
    const state = doc.materialize() as Record<string, unknown>;
    const listKeys = new Set(FORM_SCHEMA.collections.map((col) => col.listKey));
    const fieldPrefixes = FORM_SCHEMA.collections.flatMap((col) => col.fields.map((f) => f.key));
    const dataKeys = Object.keys(state).filter((k) => !listKeys.has(k));
    for (const key of dataKeys) {
      const matched = fieldPrefixes.some((p) => key.startsWith(p + ':') || key === p);
      expect(matched, `key "${key}" not in FORM_SCHEMA`).toBe(true);
    }
  });
});
