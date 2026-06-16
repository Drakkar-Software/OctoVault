import { describe, it, expect } from 'vitest';
import {
  WalDocument,
  createEd25519Signer,
  noopEncryptor,
  type WalTransport,
  type WalAppendElement,
} from '@drakkar.software/starfish-wal';
import { ed25519Suite } from '@drakkar.software/starfish-protocol';

import * as c from './feedback-content';

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

async function openDoc(transport: WalTransport, documentKey = 'fb__doc'): Promise<WalDocument> {
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

describe('addItem / readItems', () => {
  it('adds an item with status open', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Dark mode support');
    const items = c.readItems(doc);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, title: 'Dark mode support', status: 'open', desc: null, voters: [] });
  });
});

describe('vote / unvote', () => {
  it('vote adds userId to voters', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Feature X');
    c.vote(doc, id, 'user-a', []);
    const items = c.readItems(doc);
    expect(items[0]!.voters).toEqual(['user-a']);
  });

  it('vote is idempotent — no duplicate added', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Feature X');
    c.vote(doc, id, 'user-a', []);
    const before = c.readItems(doc)[0]!.voters;
    c.vote(doc, id, 'user-a', before);
    const after = c.readItems(doc)[0]!.voters;
    expect(after).toEqual(['user-a']);
  });

  it('unvote removes userId from voters', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Feature X');
    c.vote(doc, id, 'user-a', []);
    const voters = c.readItems(doc)[0]!.voters;
    c.unvote(doc, id, 'user-a', voters);
    expect(c.readItems(doc)[0]!.voters).toEqual([]);
  });

  it('unvote is idempotent — no error when user not in voters', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Feature X');
    // user-a never voted; unvote should be a no-op
    expect(() => c.unvote(doc, id, 'user-a', [])).not.toThrow();
    expect(c.readItems(doc)[0]!.voters).toEqual([]);
  });
});

describe('readItems sorting', () => {
  it('sorts items by voters.length descending (most votes first)', async () => {
    const doc = await openDoc(memTransport());
    const a = c.addItem(doc, 'A');
    const b = c.addItem(doc, 'B');
    const d = c.addItem(doc, 'C');
    // Give B 2 votes, C 1 vote, A 0 votes
    c.vote(doc, b, 'user-1', []);
    c.vote(doc, b, 'user-2', ['user-1']);
    c.vote(doc, d, 'user-3', []);
    const items = c.readItems(doc);
    expect(items.map((i) => i.id)).toEqual([b, d, a]);
  });
});

describe('patchItem', () => {
  it('updates status and desc', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Feature Y');
    c.patchItem(doc, id, { status: 'planned', desc: 'Coming in Q3' });
    const items = c.readItems(doc);
    expect(items[0]).toMatchObject({ status: 'planned', desc: 'Coming in Q3' });
  });

  it('clears desc when set to null', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Feature Z');
    c.patchItem(doc, id, { desc: 'initial' });
    c.patchItem(doc, id, { desc: null });
    expect(c.readItems(doc)[0]!.desc).toBeNull();
  });
});

describe('deleteItem', () => {
  it('removes an item from the list', async () => {
    const doc = await openDoc(memTransport());
    const a = c.addItem(doc, 'Keep');
    const b = c.addItem(doc, 'Remove');
    c.deleteItem(doc, b);
    const items = c.readItems(doc);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(a);
  });
});

describe('convergence across two replicas', () => {
  it('merges concurrent status patches', async () => {
    const transport = memTransport();
    const a = await openDoc(transport);
    const b = await openDoc(transport);

    // A creates the item and both replicas see it
    const id = c.addItem(a, 'Shared item');
    await a.commit();
    await b.pull();

    // A patches status to 'planned'
    c.patchItem(a, id, { status: 'planned' });
    await a.commit();
    await b.pull();

    // After sync, B sees the updated status
    const item = c.readItems(b).find((i) => i.id === id);
    expect(item?.status).toBe('planned');
  });

  it('concurrent votes from two replicas both survive (no LWW clobber)', async () => {
    const transport = memTransport();
    const docA = await openDoc(transport);
    const docB = await openDoc(transport);

    // A creates the item; both replicas sync it
    const id = c.addItem(docA, 'Concurrent vote item');
    await docA.commit();
    await docB.pull();

    // A and B each vote concurrently (neither has seen the other's vote)
    c.vote(docA, id, 'user-alice', []);
    c.vote(docB, id, 'user-bob', []);

    // Commit both, then each pulls the other's ops
    await docA.commit();
    await docB.commit();
    await docA.pull();
    await docB.pull();

    // Both votes must survive on both replicas — commutative merge, no clobber
    const votersA = c.readItems(docA).find((i) => i.id === id)?.voters ?? [];
    const votersB = c.readItems(docB).find((i) => i.id === id)?.voters ?? [];
    expect(votersA).toContain('user-alice');
    expect(votersA).toContain('user-bob');
    expect(votersB).toContain('user-alice');
    expect(votersB).toContain('user-bob');
  });

  it('unvote after concurrent vote leaves the un-voter removed and other vote intact', async () => {
    const transport = memTransport();
    const docA = await openDoc(transport);
    const docB = await openDoc(transport);

    const id = c.addItem(docA, 'Unvote convergence');
    await docA.commit();
    await docB.pull();

    // Both vote
    c.vote(docA, id, 'user-alice', []);
    c.vote(docB, id, 'user-bob', []);
    await docA.commit();
    await docB.commit();
    await docA.pull();
    await docB.pull();

    // Alice unvotes on her replica
    const votersA = c.readItems(docA).find((i) => i.id === id)?.voters ?? [];
    c.unvote(docA, id, 'user-alice', votersA);
    await docA.commit();
    await docB.pull();

    // Bob's vote should still be present; Alice's removed
    const votersB = c.readItems(docB).find((i) => i.id === id)?.voters ?? [];
    expect(votersB).not.toContain('user-alice');
    expect(votersB).toContain('user-bob');
  });
});
