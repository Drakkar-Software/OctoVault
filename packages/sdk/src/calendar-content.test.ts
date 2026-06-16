import { describe, it, expect } from 'vitest';
import {
  WalDocument,
  createEd25519Signer,
  noopEncryptor,
  type WalTransport,
  type WalAppendElement,
} from '@drakkar.software/starfish-wal';
import { ed25519Suite } from '@drakkar.software/starfish-protocol';

import * as c from './calendar-content';
import { CALENDAR_SCHEMA } from './object-content-model';

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

async function openDoc(transport: WalTransport, documentKey = 'cal__doc'): Promise<WalDocument> {
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

describe('addEvent / readEvents', () => {
  it('adds an event and reads it back', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addEvent(doc, { start: 1000, end: 2000, title: 'Team meeting' });
    const events = c.readEvents(doc);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id, title: 'Team meeting', start: 1000, end: 2000, allDay: false, color: null, desc: null });
  });

  it('`end` defaults to `start` when omitted', async () => {
    const doc = await openDoc(memTransport());
    c.addEvent(doc, { start: 5000 });
    const events = c.readEvents(doc);
    expect(events[0]!.end).toBe(5000);
  });

  it('readEvents sorts events by start ascending', async () => {
    const doc = await openDoc(memTransport());
    c.addEvent(doc, { start: 3000, title: 'C' });
    c.addEvent(doc, { start: 1000, title: 'A' });
    c.addEvent(doc, { start: 2000, title: 'B' });
    const events = c.readEvents(doc);
    expect(events.map((e) => e.title)).toEqual(['A', 'B', 'C']);
  });
});

describe('patchEvent', () => {
  it('updates LWW fields', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addEvent(doc, { start: 1000, end: 2000, title: 'Meeting' });
    c.patchEvent(doc, id, { start: 1500, color: '#f00', desc: 'Updated desc' });
    const events = c.readEvents(doc);
    expect(events[0]).toMatchObject({ id, start: 1500, color: '#f00', desc: 'Updated desc' });
  });

  it('clears nullable fields when set to null', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addEvent(doc, { start: 1000, color: '#f00', desc: 'hello' });
    c.patchEvent(doc, id, { color: null, desc: null });
    const events = c.readEvents(doc);
    expect(events[0]!.color).toBeNull();
    expect(events[0]!.desc).toBeNull();
  });
});

describe('deleteEvent', () => {
  it('removes the event from the list', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addEvent(doc, { start: 1000, title: 'To delete' });
    c.addEvent(doc, { start: 2000, title: 'Keep' });
    c.deleteEvent(doc, id);
    const events = c.readEvents(doc);
    expect(events).toHaveLength(1);
    expect(events[0]!.title).toBe('Keep');
  });
});

describe('convergence across two replicas', () => {
  it('merges concurrent events from two replicas', async () => {
    const transport = memTransport();
    const a = await openDoc(transport);
    const b = await openDoc(transport);

    c.addEvent(a, { start: 1000, title: 'From A' });
    c.addEvent(b, { start: 2000, title: 'From B' });
    await a.commit();
    await b.commit();
    await a.pull();
    await b.pull();

    const titlesA = c.readEvents(a).map((e) => e.title).sort();
    const titlesB = c.readEvents(b).map((e) => e.title).sort();
    expect(titlesA).toEqual(['From A', 'From B']);
    expect(titlesB).toEqual(['From A', 'From B']);
  });

  it('concurrent patches to different fields on the same event both survive', async () => {
    const transport = memTransport();
    const docA = await openDoc(transport);
    const docB = await openDoc(transport);

    // A creates the event; both replicas sync it
    const id = c.addEvent(docA, { start: 1000, title: 'Shared' });
    await docA.commit();
    await docB.pull();

    // A patches start; B patches color — concurrent, no overlap
    c.patchEvent(docA, id, { start: 1500 });
    c.patchEvent(docB, id, { color: '#00f' });
    await docA.commit();
    await docB.commit();
    await docA.pull();
    await docB.pull();

    // Both fields should survive on both replicas
    const evA = c.readEvents(docA).find((e) => e.id === id)!;
    const evB = c.readEvents(docB).find((e) => e.id === id)!;
    expect(evA.start).toBe(1500);
    expect(evA.color).toBe('#00f');
    expect(evB.start).toBe(1500);
    expect(evB.color).toBe('#00f');
  });

  it('cross-replica delete convergence — deleted event disappears on both replicas', async () => {
    const transport = memTransport();
    const docA = await openDoc(transport);
    const docB = await openDoc(transport);

    const id = c.addEvent(docA, { start: 1000, title: 'To delete' });
    c.addEvent(docA, { start: 2000, title: 'Survivor' });
    await docA.commit();
    await docB.pull();

    // A patches the soon-to-be-deleted event; B deletes it — concurrent
    c.patchEvent(docA, id, { desc: 'patched before delete' });
    c.deleteEvent(docB, id);
    await docA.commit();
    await docB.commit();
    await docA.pull();
    await docB.pull();

    // Neither replica should show the deleted event
    expect(c.readEvents(docA).find((e) => e.id === id)).toBeUndefined();
    expect(c.readEvents(docB).find((e) => e.id === id)).toBeUndefined();
    // The survivor event should still be there
    expect(c.readEvents(docA)).toHaveLength(1);
    expect(c.readEvents(docB)).toHaveLength(1);
  });
});

describe('schema guard — CALENDAR_SCHEMA field keys match actual writes', () => {
  it('all keys written by addEvent/patchEvent match CALENDAR_SCHEMA prefixes', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addEvent(doc, { start: 1000, end: 2000, title: 'G', allDay: true, color: '#f00', desc: 'D' });
    c.patchEvent(doc, id, { start: 1500 });
    const state = doc.materialize() as Record<string, unknown>;
    const listKey = CALENDAR_SCHEMA.collections[0]!.listKey;
    const fieldPrefixes = CALENDAR_SCHEMA.collections.flatMap((col) => col.fields.map((f) => f.key));
    const dataKeys = Object.keys(state).filter((k) => k !== listKey);
    for (const key of dataKeys) {
      const matched = fieldPrefixes.some((p) => key.startsWith(p + ':') || key === p);
      expect(matched, `key "${key}" not in CALENDAR_SCHEMA`).toBe(true);
    }
  });
});
