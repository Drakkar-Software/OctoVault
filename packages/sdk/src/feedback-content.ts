import type { Json, WalDocument } from '@drakkar.software/starfish-wal';
import { randomId } from './domain/ids';

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
// Per-voter add-wins register: `ivote:{itemId}:{userId}`.
// Each voter owns their own key, so concurrent votes from different devices
// commute — no LWW-clobber race. Replaces the old single `ivoters:{id}` LWW array.
const voteKey    = (itemId: string, userId: string) => `ivote:${itemId}:${userId}`;
// Prefix used to scan all votes for an item.
const votePrefix = (itemId: string) => `ivote:${itemId}:`;

function itemsOrder(doc: WalDocument): string[] {
  const v = doc.materialize()[ITEMS];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

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
  const order = Array.isArray(state[ITEMS]) ? (state[ITEMS] as Json[]) : [];
  const seen = new Set<string>();
  const items: FeedbackItem[] = [];
  for (const raw of order) {
    if (typeof raw !== 'string' || seen.has(raw)) continue;
    seen.add(raw);
    items.push({
      id: raw,
      title: doc.text(titleList(raw)),
      status: (typeof state[statusReg(raw)] === 'string' ? state[statusReg(raw)] : 'open') as FeedbackStatus,
      desc: typeof state[descReg(raw)] === 'string' ? (state[descReg(raw)] as string) : null,
      voters: readVoters(state, raw),
    });
  }
  return items.sort((a, b) => b.voters.length - a.voters.length);
}

export function addItem(doc: WalDocument, title: string): string {
  const id = randomId();
  const order = itemsOrder(doc);
  doc.setText(titleList(id), title);
  doc.setField(statusReg(id), 'open');
  doc.setList(ITEMS, [...order, id]);
  return id;
}

export function deleteItem(doc: WalDocument, id: string): void {
  const order = itemsOrder(doc);
  doc.setList(ITEMS, order.filter((x) => x !== id));
  doc.setText(titleList(id), '');
  doc.deleteField(statusReg(id));
  doc.deleteField(descReg(id));
  // Clean up all per-voter keys for this item.
  const state = doc.materialize() as Record<string, Json>;
  const prefix = votePrefix(id);
  for (const key of Object.keys(state)) {
    if (key.startsWith(prefix)) doc.deleteField(key);
  }
}

export function patchItem(doc: WalDocument, id: string, patch: Partial<Omit<FeedbackItem, 'id' | 'voters'>>): void {
  if (patch.status !== undefined) doc.setField(statusReg(id), patch.status);
  if (patch.desc !== undefined) {
    if (patch.desc === null) doc.deleteField(descReg(id));
    else doc.setField(descReg(id), patch.desc);
  }
  if (patch.title !== undefined) doc.setText(titleList(id), patch.title);
}

export function vote(doc: WalDocument, id: string, userId: string, currentVoters: string[]): void {
  if (currentVoters.includes(userId)) return;
  doc.setField(voteKey(id, userId), true);
}

export function unvote(doc: WalDocument, id: string, userId: string, currentVoters: string[]): void {
  if (!currentVoters.includes(userId)) return;
  doc.deleteField(voteKey(id, userId));
}
