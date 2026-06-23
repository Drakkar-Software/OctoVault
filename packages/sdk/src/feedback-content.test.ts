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
import { FEEDBACK_SCHEMA } from './object-content-model';

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
    c.vote(doc, id, 'user-a');
    const items = c.readItems(doc);
    expect(items[0]!.voters).toEqual(['user-a']);
  });

  it('vote is idempotent — no duplicate added', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Feature X');
    c.vote(doc, id, 'user-a');
    c.vote(doc, id, 'user-a');
    const after = c.readItems(doc)[0]!.voters;
    expect(after).toEqual(['user-a']);
  });

  it('unvote removes userId from voters', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Feature X');
    c.vote(doc, id, 'user-a');
    c.unvote(doc, id, 'user-a');
    expect(c.readItems(doc)[0]!.voters).toEqual([]);
  });

  it('unvote is idempotent — no error when user not in voters', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Feature X');
    // user-a never voted; unvote should be a no-op
    expect(() => c.unvote(doc, id, 'user-a')).not.toThrow();
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
    c.vote(doc, b, 'user-1');
    c.vote(doc, b, 'user-2');
    c.vote(doc, d, 'user-3');
    const items = c.readItems(doc);
    expect(items.map((i) => i.id)).toEqual([b, d, a]);
  });

  it('sorts equal-vote items by id tiebreak (deterministic)', async () => {
    const doc = await openDoc(memTransport());
    const a = c.addItem(doc, 'A');
    const b = c.addItem(doc, 'B');
    // Neither has votes — ids determine order
    const items = c.readItems(doc);
    const sorted = [a, b].sort();
    expect(items.map((i) => i.id)).toEqual(sorted);
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

  it('deleteItem clears all per-voter keys for the deleted item', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'To delete');
    c.vote(doc, id, 'user-a');
    c.vote(doc, id, 'user-b');
    c.deleteItem(doc, id);
    // Deleted item must not appear in readItems
    expect(c.readItems(doc)).toHaveLength(0);
    // No orphan ivote keys for the deleted item should remain
    const state = doc.materialize() as Record<string, unknown>;
    const orphans = Object.keys(state).filter((k) => k.startsWith(`ivote:${id}:`));
    expect(orphans).toHaveLength(0);
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
    c.vote(docA, id, 'user-alice');
    c.vote(docB, id, 'user-bob');

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

  it('same-voter unvote then re-vote resolves via LWW (later Lamport clock wins)', async () => {
    // LWW tiebreaking: the WAL clock is ticked at mutation time (not commit time).
    // "Concurrent" ops from two replicas that haven't synced get the SAME `c` value
    // and then tie-break on replicaId — making the result non-deterministic.
    // This test instead verifies the meaningful property: an op created AFTER
    // observing the opposing op (strictly higher Lamport counter) wins.
    const transport = memTransport();
    const docA = await openDoc(transport);
    const docB = await openDoc(transport);

    const id = c.addItem(docA, 'LWW vote test');
    await docA.commit();
    await docB.pull();

    // B unvotes and commits first; A observes, then votes with a higher counter.
    c.unvote(docB, id, 'user-alice');
    await docB.commit();
    await docA.pull(); // A's Lamport clock advances past B's unvote clock
    c.vote(docA, id, 'user-alice'); // A ticks to a strictly higher c → vote wins
    await docA.commit();
    await docB.pull();

    const votersA = c.readItems(docA).find((i) => i.id === id)?.voters ?? [];
    const votersB = c.readItems(docB).find((i) => i.id === id)?.voters ?? [];
    expect(votersA).toContain('user-alice');
    expect(votersB).toContain('user-alice');
  });

  it('re-vote after remote unvote adds the voter back', async () => {
    const transport = memTransport();
    const docA = await openDoc(transport);
    const docB = await openDoc(transport);

    const id = c.addItem(docA, 'Re-vote test');
    // A votes and commits; B pulls it
    c.vote(docA, id, 'user-alice');
    await docA.commit();
    await docB.pull();

    // B unvotes and commits; A pulls the unvote
    c.unvote(docB, id, 'user-alice');
    await docB.commit();
    await docA.pull();
    expect(c.readItems(docA).find((i) => i.id === id)?.voters).toEqual([]);

    // A re-votes and commits; B pulls it → alice is back in voters
    c.vote(docA, id, 'user-alice');
    await docA.commit();
    await docB.pull();

    const votersB = c.readItems(docB).find((i) => i.id === id)?.voters ?? [];
    expect(votersB).toContain('user-alice');
  });

  it('unvote after concurrent vote leaves the un-voter removed and other vote intact', async () => {
    const transport = memTransport();
    const docA = await openDoc(transport);
    const docB = await openDoc(transport);

    const id = c.addItem(docA, 'Unvote convergence');
    await docA.commit();
    await docB.pull();

    // Both vote
    c.vote(docA, id, 'user-alice');
    c.vote(docB, id, 'user-bob');
    await docA.commit();
    await docB.commit();
    await docA.pull();
    await docB.pull();

    // Alice unvotes on her replica
    c.unvote(docA, id, 'user-alice');
    await docA.commit();
    await docB.pull();

    // Bob's vote should still be present; Alice's removed
    const votersB = c.readItems(docB).find((i) => i.id === id)?.voters ?? [];
    expect(votersB).not.toContain('user-alice');
    expect(votersB).toContain('user-bob');
  });
});

describe('schema guard — FEEDBACK_SCHEMA field keys match actual writes', () => {
  it('all keys written by addItem/vote/patchItem match FEEDBACK_SCHEMA prefixes', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addItem(doc, 'Guard test');
    c.vote(doc, id, 'user-x');
    c.patchItem(doc, id, { status: 'planned', desc: 'desc' });
    const state = doc.materialize() as Record<string, unknown>;
    const listKey = FEEDBACK_SCHEMA.collections[0]!.listKey;
    const fieldPrefixes = FEEDBACK_SCHEMA.collections.flatMap((col) => col.fields.map((f) => f.key));
    const dataKeys = Object.keys(state).filter((k) => k !== listKey);
    for (const key of dataKeys) {
      const matched = fieldPrefixes.some((p) => key.startsWith(p + ':') || key === p);
      expect(matched, `key "${key}" not in FEEDBACK_SCHEMA`).toBe(true);
    }
  });
});
