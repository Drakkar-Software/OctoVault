import { describe, it, expect } from 'vitest';
import {
  WalDocument,
  createEd25519Signer,
  noopEncryptor,
  type WalTransport,
  type WalAppendElement,
} from '@drakkar.software/starfish-wal';
import { ed25519Suite } from '@drakkar.software/starfish-protocol';

import * as c from './comments-content';

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

async function openDoc(transport: WalTransport, documentKey = 'page~comments'): Promise<WalDocument> {
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

const BLOCK = 'block-1';

describe('addComment / readThread', () => {
  it('adds a comment to a block discussion', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addComment(doc, BLOCK, 'user-a', 'first comment', 1000);
    const thread = c.readThread(doc, BLOCK);
    expect(thread.blockId).toBe(BLOCK);
    expect(thread.resolved).toBe(false);
    expect(thread.comments).toHaveLength(1);
    expect(thread.comments[0]).toMatchObject({ id, author: 'user-a', body: 'first comment', createdAt: 1000 });
    expect(thread.comments[0]!.reactions).toEqual([]);
  });

  it('keeps multiple comments per discussion in append order', async () => {
    const doc = await openDoc(memTransport());
    c.addComment(doc, BLOCK, 'user-a', 'one', 1000);
    c.addComment(doc, BLOCK, 'user-b', 'two', 2000);
    c.addComment(doc, BLOCK, 'user-a', 'three', 3000);
    const bodies = c.readThread(doc, BLOCK).comments.map((x) => x.body);
    expect(bodies).toEqual(['one', 'two', 'three']);
  });

  it('readThreads indexes every block with comments and skips empty ones', async () => {
    const doc = await openDoc(memTransport());
    c.addComment(doc, 'block-1', 'user-a', 'a', 1000);
    c.addComment(doc, 'block-2', 'user-b', 'b', 2000);
    const threads = c.readThreads(doc);
    expect([...threads.keys()].sort()).toEqual(['block-1', 'block-2']);
    expect(threads.get('block-1')!.comments[0]!.body).toBe('a');
  });
});

describe('editing, removing, resolving', () => {
  it('edits a comment body', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addComment(doc, BLOCK, 'user-a', 'typo', 1000);
    c.setCommentBody(doc, id, 'fixed');
    expect(c.readThread(doc, BLOCK).comments[0]!.body).toBe('fixed');
  });

  it('removes a comment and drops it from the thread', async () => {
    const doc = await openDoc(memTransport());
    const a = c.addComment(doc, BLOCK, 'user-a', 'keep', 1000);
    const b = c.addComment(doc, BLOCK, 'user-b', 'remove', 2000);
    c.toggleReaction(doc, b, 'user-a', '👍');
    c.removeComment(doc, BLOCK, b);
    const thread = c.readThread(doc, BLOCK);
    expect(thread.comments.map((x) => x.id)).toEqual([a]);
    // The removed comment's reaction registers are tombstoned too.
    expect(c.readThreads(doc).get(BLOCK)!.comments).toHaveLength(1);
  });

  it('resolves and reopens a discussion', async () => {
    const doc = await openDoc(memTransport());
    c.addComment(doc, BLOCK, 'user-a', 'q', 1000);
    c.resolveThread(doc, BLOCK, true);
    expect(c.readThread(doc, BLOCK).resolved).toBe(true);
    c.resolveThread(doc, BLOCK, false);
    expect(c.readThread(doc, BLOCK).resolved).toBe(false);
  });

  it('reports last activity as the newest comment timestamp', async () => {
    const doc = await openDoc(memTransport());
    c.addComment(doc, BLOCK, 'user-a', 'one', 1000);
    c.addComment(doc, BLOCK, 'user-b', 'two', 5000);
    expect(c.threadLastActivity(c.readThread(doc, BLOCK))).toBe(5000);
  });
});

describe('reactions', () => {
  it('toggles a reaction on and off for one user', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addComment(doc, BLOCK, 'user-a', 'hi', 1000);
    c.toggleReaction(doc, id, 'user-a', '❤️');
    expect(c.readThread(doc, BLOCK).comments[0]!.reactions).toEqual([{ emoji: '❤️', userIds: ['user-a'] }]);
    c.toggleReaction(doc, id, 'user-a', '❤️');
    expect(c.readThread(doc, BLOCK).comments[0]!.reactions).toEqual([]);
  });

  it('aggregates multiple emojis from one user', async () => {
    const doc = await openDoc(memTransport());
    const id = c.addComment(doc, BLOCK, 'user-a', 'hi', 1000);
    c.toggleReaction(doc, id, 'user-a', '👍');
    c.toggleReaction(doc, id, 'user-a', '🎉');
    const reactions = c.readThread(doc, BLOCK).comments[0]!.reactions;
    expect(reactions.map((r) => r.emoji).sort()).toEqual(['🎉', '👍'].sort());
    expect(reactions.every((r) => r.userIds.length === 1 && r.userIds[0] === 'user-a')).toBe(true);
  });
});

describe('convergence across two replicas', () => {
  it('merges concurrent comments on the same block', async () => {
    const transport = memTransport();
    const a = await openDoc(transport);
    const b = await openDoc(transport);

    c.addComment(a, BLOCK, 'user-a', 'from A', 1000);
    c.addComment(b, BLOCK, 'user-b', 'from B', 1001);
    await a.commit();
    await b.commit();
    await a.pull();
    await b.pull();

    const bodiesA = c.readThread(a, BLOCK).comments.map((x) => x.body).sort();
    const bodiesB = c.readThread(b, BLOCK).comments.map((x) => x.body).sort();
    expect(bodiesA).toEqual(['from A', 'from B']);
    expect(bodiesB).toEqual(['from A', 'from B']);
  });

  it('merges concurrent reactions without clobbering, and toggling off is per-user', async () => {
    const transport = memTransport();
    const a = await openDoc(transport);
    const b = await openDoc(transport);

    // A authors the comment; B pulls it in.
    const id = c.addComment(a, BLOCK, 'user-a', 'react to me', 1000);
    await a.commit();
    await b.pull();

    // Both react with 👍 concurrently (each into its own per-reactor register).
    c.toggleReaction(a, id, 'user-a', '👍');
    c.toggleReaction(b, id, 'user-b', '👍');
    await a.commit();
    await b.commit();
    await a.pull();
    await b.pull();

    const reactA = c.readThread(a, BLOCK).comments[0]!.reactions;
    expect(reactA).toEqual([{ emoji: '👍', userIds: ['user-a', 'user-b'] }]);

    // A toggles its 👍 off — B's reaction survives (no clobber).
    c.toggleReaction(a, id, 'user-a', '👍');
    await a.commit();
    await b.pull();
    expect(c.readThread(b, BLOCK).comments[0]!.reactions).toEqual([{ emoji: '👍', userIds: ['user-b'] }]);
  });
});
