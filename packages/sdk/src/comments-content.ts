/**
 * Per-block discussions on a {@link WalDocument} — the Notion-style "floating
 * comment" core. Lives in a page's **sibling** comments WAL doc (one per page,
 * keyed `…~comments`), separate from the page content doc so the page snapshot
 * stays lean and comments load in parallel.
 *
 * A **discussion** is the thread anchored to one block (by its stable block id):
 *  - a per-block RGA list **`comments:{blockId}`** of comment ids (append order);
 *  - per comment, the author **`author:{commentId}`** (LWW, the account userId —
 *    the device key only *signs* the op), the timestamp **`created:{commentId}`**
 *    (LWW) and a char-RGA body **`body:{commentId}`** so two people editing the
 *    same comment converge per character;
 *  - per block, a thread-level **`resolved:{blockId}`** flag (LWW);
 *  - per (comment, reactor), an emoji set **`react:{commentId}:{userId}`** (LWW
 *    JSON array). A **per-reactor** register — not one shared map — so two members
 *    reacting at once never clobber each other; the projection folds the
 *    `react:{commentId}:*` registers into `{ emoji → userIds[] }`.
 *
 * All registers follow the same `name:{id}` pattern as {@link page-content}, so a
 * future field costs one line here and nothing in the transport. Pure functions
 * over a WalDocument (no React, no network) — the `use-comments` hook owns
 * commit/pull; these only build ops.
 */
import type { Json, WalDocument } from '@drakkar.software/starfish-wal';

import { randomId } from './domain/ids';

/** One emoji and the members who reacted with it. */
export interface CommentReaction {
  emoji: string;
  userIds: string[];
}

/** A single comment in a block's discussion. */
export interface Comment {
  id: string;
  /** Account userId of the author (resolved to a name/avatar at the UI layer). */
  author: string;
  /** Creation timestamp (ms since epoch). */
  createdAt: number;
  /** Char-RGA body text. */
  body: string;
  /** Aggregated emoji reactions (empty when none). */
  reactions: CommentReaction[];
}

/** The discussion anchored to one block. */
export interface DiscussionThread {
  blockId: string;
  resolved: boolean;
  comments: Comment[];
}

const COMMENTS_PREFIX = 'comments:';
const REACT_PREFIX = 'react:';
const commentsList = (blockId: string) => `${COMMENTS_PREFIX}${blockId}`;
const authorReg = (commentId: string) => `author:${commentId}`;
const createdReg = (commentId: string) => `created:${commentId}`;
const bodyList = (commentId: string) => `body:${commentId}`;
const resolvedReg = (blockId: string) => `resolved:${blockId}`;
const reactReg = (commentId: string, userId: string) => `${REACT_PREFIX}${commentId}:${userId}`;

function ids(value: Json | undefined): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

function emojis(value: Json | undefined): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

/** Live comment ids for a block, in RGA order, de-duplicated. */
function commentIds(state: Record<string, Json>, blockId: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids(state[commentsList(blockId)])) {
    if (seen.has(id)) continue; // dedup concurrent reorders
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Fold the per-reactor `react:{commentId}:*` registers into emoji groups.
 *  Encounter order follows the materialized key order (code-point stable). */
function readReactions(state: Record<string, Json>, commentId: string): CommentReaction[] {
  const prefix = `${REACT_PREFIX}${commentId}:`;
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(state)) {
    if (!key.startsWith(prefix)) continue;
    const userId = key.slice(prefix.length);
    for (const emoji of emojis(state[key])) {
      const arr = groups.get(emoji) ?? [];
      if (!arr.includes(userId)) arr.push(userId);
      groups.set(emoji, arr);
    }
  }
  const out: CommentReaction[] = [];
  for (const [emoji, userIds] of groups) {
    if (userIds.length > 0) out.push({ emoji, userIds: userIds.sort() });
  }
  return out;
}

function readComment(doc: WalDocument, state: Record<string, Json>, id: string): Comment {
  const createdVal = state[createdReg(id)];
  const authorVal = state[authorReg(id)];
  return {
    id,
    author: typeof authorVal === 'string' ? authorVal : '',
    createdAt: typeof createdVal === 'number' ? createdVal : 0,
    body: doc.text(bodyList(id)),
    reactions: readReactions(state, id),
  };
}

/** Project the discussion for a single block (empty thread when none exist). */
export function readThread(doc: WalDocument, blockId: string): DiscussionThread {
  const state = doc.materialize();
  return {
    blockId,
    resolved: state[resolvedReg(blockId)] === true,
    comments: commentIds(state, blockId).map((id) => readComment(doc, state, id)),
  };
}

/** Project every block's discussion that holds at least one comment, keyed by
 *  block id. The page editor reads this once and indexes per block. */
export function readThreads(doc: WalDocument): Map<string, DiscussionThread> {
  const state = doc.materialize();
  const threads = new Map<string, DiscussionThread>();
  for (const key of Object.keys(state)) {
    if (!key.startsWith(COMMENTS_PREFIX)) continue;
    const blockId = key.slice(COMMENTS_PREFIX.length);
    const liveIds = commentIds(state, blockId);
    if (liveIds.length === 0) continue;
    threads.set(blockId, {
      blockId,
      resolved: state[resolvedReg(blockId)] === true,
      comments: liveIds.map((id) => readComment(doc, state, id)),
    });
  }
  return threads;
}

/** Most-recent comment timestamp in a thread (0 when empty) — the unread sort key. */
export function threadLastActivity(thread: DiscussionThread): number {
  return thread.comments.reduce((max, c) => (c.createdAt > max ? c.createdAt : max), 0);
}

/** Add a comment to a block's discussion. Returns the new comment id. */
export function addComment(
  doc: WalDocument,
  blockId: string,
  authorUserId: string,
  text: string,
  createdAt: number = Date.now(),
): string {
  const id = randomId();
  doc.setField(authorReg(id), authorUserId);
  doc.setField(createdReg(id), createdAt);
  if (text) doc.setText(bodyList(id), text);
  doc.push(commentsList(blockId), id);
  return id;
}

/** Replace a comment's body text (character-level CRDT merge). */
export function setCommentBody(doc: WalDocument, commentId: string, text: string): void {
  doc.setText(bodyList(commentId), text);
}

/** Remove a comment: drop it from the block's list, clear its body, and tombstone
 *  its author/timestamp registers plus every reactor's register for it. */
export function removeComment(doc: WalDocument, blockId: string, commentId: string): void {
  const state = doc.materialize();
  doc.setList(commentsList(blockId), commentIds(state, blockId).filter((x) => x !== commentId));
  doc.setText(bodyList(commentId), '');
  doc.deleteField(authorReg(commentId));
  doc.deleteField(createdReg(commentId));
  const prefix = `${REACT_PREFIX}${commentId}:`;
  for (const key of Object.keys(state)) {
    if (key.startsWith(prefix)) doc.deleteField(key);
  }
}

/** Mark a block's discussion resolved (or reopen it). Clears the register when
 *  reopening so a resolved-then-reopened thread leaves no snapshot residue. */
export function resolveThread(doc: WalDocument, blockId: string, resolved: boolean): void {
  if (resolved) doc.setField(resolvedReg(blockId), true);
  else doc.deleteField(resolvedReg(blockId));
}

/** Toggle one member's emoji reaction on a comment. Updates only that member's
 *  own `react:{commentId}:{userId}` register, so concurrent reactors never
 *  clobber each other; the register is cleared when their last emoji is removed. */
export function toggleReaction(
  doc: WalDocument,
  commentId: string,
  userId: string,
  emoji: string,
): void {
  const current = emojis(doc.materialize()[reactReg(commentId, userId)]);
  const next = current.includes(emoji)
    ? current.filter((e) => e !== emoji)
    : [...current, emoji];
  if (next.length === 0) doc.deleteField(reactReg(commentId, userId));
  else doc.setField(reactReg(commentId, userId), next);
}
