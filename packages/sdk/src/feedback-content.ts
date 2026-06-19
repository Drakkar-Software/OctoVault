import type { Json, WalDocument } from '@drakkar.software/starfish-wal';
import { randomId } from './domain/ids';
import { rgaList, dedupRgaList, deleteFieldsByPrefix, asStrOrNull } from './wal-helpers';

export type FeedbackStatus = 'open' | 'planned' | 'in-progress' | 'done';

export interface FeedbackItem {
  id: string;
  title: string;
  status: FeedbackStatus;
  desc: string | null;
  voters: string[];
}

const ITEMS = 'items';

const titleList  = (id: string) => `ititle:${id}`;
const statusReg  = (id: string) => `istatus:${id}`;
const descReg    = (id: string) => `idesc:${id}`;
// Per-voter LWW toggle register: `ivote:{itemId}:{userId}`.
// Each voter owns their own key, so concurrent votes from *different* users
// commute (no cross-voter LWW-clobber race). For the *same* user, vote
// (setField→true) vs unvote (deleteField) on the same key is plain LWW —
// the higher-clock op wins. Replaces the old single `ivoters:{id}` LWW array.
const voteKey    = (itemId: string, userId: string) => `ivote:${itemId}:${userId}`;
// Prefix used to scan all votes for an item.
const votePrefix = (itemId: string) => `ivote:${itemId}:`;

/** Collect all voter userIds for `itemId` by scanning per-voter keys. */
function readVoters(state: Record<string, Json>, itemId: string): string[] {
  const prefix = votePrefix(itemId);
  const voters: string[] = [];
  for (const key of Object.keys(state)) {
    if (key.startsWith(prefix) && state[key] === true) {
      voters.push(key.slice(prefix.length));
    }
  }
  return voters;
}

export function readItems(doc: WalDocument): FeedbackItem[] {
  const state = doc.materialize() as Record<string, Json>;
  const items: FeedbackItem[] = [];
  for (const raw of dedupRgaList(state[ITEMS])) {
    items.push({
      id: raw,
      title: doc.text(titleList(raw)),
      status: (typeof state[statusReg(raw)] === 'string' ? state[statusReg(raw)] : 'open') as FeedbackStatus,
      desc: asStrOrNull(state[descReg(raw)]),
      voters: readVoters(state, raw),
    });
  }
  // Sort by vote count descending, with an explicit id tiebreak for a deterministic
  // order that doesn't rely on Array.sort stability — mirrors task-model.ts:59.
  return items.sort((a, b) => (b.voters.length - a.voters.length) || (a.id < b.id ? -1 : 1));
}

export function addItem(doc: WalDocument, title: string): string {
  const id = randomId();
  const order = rgaList(doc, ITEMS);
  doc.setText(titleList(id), title);
  doc.setField(statusReg(id), 'open');
  doc.setList(ITEMS, [...order, id]);
  return id;
}

export function deleteItem(doc: WalDocument, id: string): void {
  const order = rgaList(doc, ITEMS);
  doc.setList(ITEMS, order.filter((x) => x !== id));
  doc.setText(titleList(id), '');
  doc.deleteField(statusReg(id));
  doc.deleteField(descReg(id));
  // Clean up all per-voter keys for this item.
  deleteFieldsByPrefix(doc, votePrefix(id));
}

export function patchItem(doc: WalDocument, id: string, patch: Partial<Omit<FeedbackItem, 'id' | 'voters'>>): void {
  if (patch.status !== undefined) doc.setField(statusReg(id), patch.status);
  if (patch.desc !== undefined) {
    if (patch.desc === null) doc.deleteField(descReg(id));
    else doc.setField(descReg(id), patch.desc);
  }
  if (patch.title !== undefined) doc.setText(titleList(id), patch.title);
}

export function vote(doc: WalDocument, id: string, userId: string): void {
  // setField is idempotent — re-voting after a remote unvote is safe and correct.
  doc.setField(voteKey(id, userId), true);
}

export function unvote(doc: WalDocument, id: string, userId: string): void {
  // deleteField is idempotent — unvoting when already absent is a no-op.
  doc.deleteField(voteKey(id, userId));
}
