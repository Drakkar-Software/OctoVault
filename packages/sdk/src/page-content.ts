/**
 * Page-as-blocks model on a {@link WalDocument} (the Notion-style core).
 *
 * One page = one WAL document holding:
 *  - an RGA list **`order`** of block ids (ordering + insert/delete; reorder via
 *    the reconcile `setList`, which keeps unchanged ids and only diffs the move);
 *  - per block, a char-RGA text list **`text:{id}`** so two people editing the
 *    same block converge per character (`setText`);
 *  - per block, LWW registers **`type:{id}`** and **`checked:{id}`** for the
 *    block kind and the to-do state, plus the structure registers
 *    **`indent:{id}`** (nesting depth under lists/toggles), **`collapsed:{id}`**
 *    (a toggle's disclosure state) and **`ref:{id}`** (the child Object id a
 *    `page` block links to). All follow the same `name:{id}` register pattern so
 *    a future register costs one line here and nothing in the transport.
 *
 * Pure functions over a WalDocument: no React, no network — unit-testable with a
 * fake transport. The `use-page` hook owns commit/pull; these only build ops.
 */
import type { Json, WalDocument } from '@drakkar.software/starfish-wal';

import { randomId } from './domain/ids';
import { rgaList, dedupRgaList, asBool, asObj } from './wal-helpers';

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'subheading'
  | 'todo'
  | 'bulleted'
  | 'numbered'
  | 'toggle'
  | 'quote'
  | 'code'
  | 'divider'
  | 'page'
  | 'image'
  | 'file'
  | 'bookmark'
  | 'table';

/** Block types that reference a child Object by id (no inline text; clicking navigates). */
export const REF_BLOCK_TYPES: ReadonlySet<BlockType> = new Set<BlockType>(['page', 'image', 'file']);

/** Cached OG metadata for a `bookmark` block (stored as a JSON LWW register). */
export interface BookmarkMeta {
  title: string;
  description?: string;
  image?: string;
  favicon?: string;
  /** The URL the metadata was fetched for — used to invalidate when `text` changes. */
  fetchedFor: string;
}

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  /** Only meaningful for `type === 'todo'`. */
  checked?: boolean;
  /** Nesting depth (0 = root). Drives the per-level indent and which toggle governs visibility. */
  indent?: number;
  /** Only meaningful for `type === 'toggle'` — whether its deeper-indented run is hidden. */
  collapsed?: boolean;
  /** Only meaningful for `type === 'page'|'image'|'file'` — the linked child Object's index id. */
  ref?: string;
  /** Only meaningful for `type === 'bookmark'` — cached OG metadata from the unfurl server. */
  bookmark?: BookmarkMeta;
}

export interface NewBlock {
  type?: BlockType;
  text?: string;
  checked?: boolean;
  indent?: number;
  ref?: string;
}

const ORDER = 'order';
const typeReg = (id: string) => `type:${id}`;
const checkedReg = (id: string) => `checked:${id}`;
const indentReg = (id: string) => `indent:${id}`;
const collapsedReg = (id: string) => `collapsed:${id}`;
const refReg = (id: string) => `ref:${id}`;
const bookmarkReg = (id: string) => `bookmark:${id}`;
const textList = (id: string) => `text:${id}`;

/** Project the WAL document into an ordered, de-duplicated list of blocks. */
export function readBlocks(doc: WalDocument): Block[] {
  const state = doc.materialize();
  const blocks: Block[] = [];
  for (const raw of dedupRgaList(state[ORDER])) {
    const type = (state[typeReg(raw)] as BlockType | undefined) ?? 'paragraph';
    const indentVal = state[indentReg(raw)];
    const refVal = state[refReg(raw)];
    blocks.push({
      id: raw,
      type,
      text: doc.text(textList(raw)),
      checked: asBool(state[checkedReg(raw)]),
      // Clamp a concurrent-merge artifact (negative indent) rather than render off-canvas.
      indent: typeof indentVal === 'number' && indentVal > 0 ? Math.floor(indentVal) : undefined,
      collapsed: asBool(state[collapsedReg(raw)]),
      ref: typeof refVal === 'string' ? refVal : undefined,
      bookmark: asObj<BookmarkMeta>(state[bookmarkReg(raw)]),
    });
  }
  return blocks;
}

/**
 * The render-visible subset: blocks governed by a COLLAPSED toggle are hidden.
 * A block is "governed" by the nearest preceding block with a SHALLOWER indent;
 * walking the list once with a hide-threshold covers arbitrarily nested toggles
 * (a visible block at/above the threshold ends the hidden run; if it is itself a
 * collapsed toggle it starts a new one). Pure — unit-tested without a renderer.
 */
export function visibleBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let hideDeeperThan: number | null = null;
  for (const b of blocks) {
    const ind = b.indent ?? 0;
    if (hideDeeperThan !== null && ind > hideDeeperThan) continue;
    hideDeeperThan = null;
    out.push(b);
    if (b.type === 'toggle' && b.collapsed) hideDeeperThan = ind;
  }
  return out;
}

/** Insert a new block at `index` (clamped). Returns the new block id. */
export function insertBlock(doc: WalDocument, index: number, init: NewBlock = {}): string {
  const id = randomId();
  doc.setField(typeReg(id), init.type ?? 'paragraph');
  if (init.text) doc.setText(textList(id), init.text);
  if (init.checked !== undefined) doc.setField(checkedReg(id), init.checked);
  if (init.indent) doc.setField(indentReg(id), init.indent);
  if (init.ref) doc.setField(refReg(id), init.ref);
  const order = rgaList(doc, ORDER);
  const at = Math.max(0, Math.min(index, order.length));
  doc.setList(ORDER, [...order.slice(0, at), id, ...order.slice(at)]);
  return id;
}

/** Append a block to the end. Returns the new block id. */
export function appendBlock(doc: WalDocument, init: NewBlock = {}): string {
  return insertBlock(doc, rgaList(doc, ORDER).length, init);
}

/** Replace a block's body text (character-level CRDT merge). */
export function setBlockText(doc: WalDocument, id: string, text: string): void {
  doc.setText(textList(id), text);
}

export function setBlockType(doc: WalDocument, id: string, type: BlockType): void {
  doc.setField(typeReg(id), type);
}

export function setBlockChecked(doc: WalDocument, id: string, checked: boolean): void {
  doc.setField(checkedReg(id), checked);
}

/** Set a block's nesting depth (clamped to ≥ 0; 0 clears the register). */
export function setBlockIndent(doc: WalDocument, id: string, indent: number): void {
  const v = Math.max(0, Math.floor(indent));
  if (v === 0) doc.deleteField(indentReg(id));
  else doc.setField(indentReg(id), v);
}

export function setBlockCollapsed(doc: WalDocument, id: string, collapsed: boolean): void {
  doc.setField(collapsedReg(id), collapsed);
}

/** Point a `page` block at the child Object it links to. */
export function setBlockRef(doc: WalDocument, id: string, ref: string): void {
  doc.setField(refReg(id), ref);
}

/** Remove a block: drop it from `order`, clear its text, tombstone its props. */
export function removeBlock(doc: WalDocument, id: string): void {
  doc.setList(ORDER, rgaList(doc, ORDER).filter((x) => x !== id));
  doc.setText(textList(id), '');
  doc.deleteField(typeReg(id));
  doc.deleteField(checkedReg(id));
  doc.deleteField(indentReg(id));
  doc.deleteField(collapsedReg(id));
  doc.deleteField(refReg(id));
  doc.deleteField(bookmarkReg(id));
}

/** Move a block to `toIndex` via a minimal reconcile of the order list. */
export function moveBlock(doc: WalDocument, id: string, toIndex: number): void {
  const order = rgaList(doc, ORDER).filter((x) => x !== id);
  const at = Math.max(0, Math.min(toIndex, order.length));
  order.splice(at, 0, id);
  doc.setList(ORDER, order);
}

/**
 * Enter-to-split: rewrite `id`'s text to `head` and insert a sibling holding the
 * tail DIRECTLY after it, as ONE op batch (the hook's single `touch()` commits
 * them together, so a concurrent fold never sees a half-split). The caller picks
 * the tail's type (list continuation) and indent. Returns the new block id, or
 * null when `id` is no longer in the order (concurrently removed).
 */
export function splitBlock(doc: WalDocument, id: string, head: string, init: NewBlock = {}): string | null {
  const order = rgaList(doc, ORDER);
  const at = order.indexOf(id);
  if (at < 0) return null;
  doc.setText(textList(id), head);
  return insertBlock(doc, at + 1, init);
}

/**
 * Backspace-at-start: append `id`'s text to the PREVIOUS block and remove `id`.
 * `textOverride` lets the editor pass its live (not-yet-committed) field value so
 * the merge never resurrects stale committed text. Returns the surviving block id
 * and the seam offset (where the caret should land), or null at the top of the doc.
 */
export function mergeBlockIntoPrevious(
  doc: WalDocument,
  id: string,
  textOverride?: string,
): { prevId: string; offset: number } | null {
  const order = rgaList(doc, ORDER);
  const at = order.indexOf(id);
  if (at <= 0) return null;
  const prevId = order[at - 1]!;
  const prevText = doc.text(textList(prevId));
  const tail = textOverride ?? doc.text(textList(id));
  if (tail) doc.setText(textList(prevId), prevText + tail);
  removeBlock(doc, id);
  return { prevId, offset: prevText.length };
}

/** Insert a copy of `id` (type/text/checked/indent/ref/bookmark) directly below it. */
export function duplicateBlock(doc: WalDocument, id: string): string | null {
  const order = rgaList(doc, ORDER);
  const at = order.indexOf(id);
  if (at < 0) return null;
  const state = doc.materialize();
  const checkedVal = state[checkedReg(id)];
  const indentVal = state[indentReg(id)];
  const refVal = state[refReg(id)];
  const newId = insertBlock(doc, at + 1, {
    type: (state[typeReg(id)] as BlockType | undefined) ?? 'paragraph',
    text: doc.text(textList(id)),
    checked: typeof checkedVal === 'boolean' ? checkedVal : undefined,
    indent: typeof indentVal === 'number' ? indentVal : undefined,
    ref: typeof refVal === 'string' ? refVal : undefined,
  });
  // Carry the cached OG metadata to the duplicate so it doesn't need a re-fetch.
  const bkVal = state[bookmarkReg(id)];
  if (bkVal && typeof bkVal === 'object' && !Array.isArray(bkVal)) {
    doc.setField(bookmarkReg(newId), bkVal);
  }
  return newId;
}

/**
 * Undo for a structural delete: re-insert a previously {@link removeBlock}-ed
 * block at `index` with its ORIGINAL id (so a concurrent device that still holds
 * ops for it converges onto the same block). Re-setting the LWW registers and
 * re-typing the text revives the tombstoned state.
 */
export function restoreBlock(doc: WalDocument, index: number, block: Block): void {
  doc.setField(typeReg(block.id), block.type);
  if (block.text) doc.setText(textList(block.id), block.text);
  if (block.checked !== undefined) doc.setField(checkedReg(block.id), block.checked);
  if (block.indent) doc.setField(indentReg(block.id), block.indent);
  if (block.collapsed !== undefined) doc.setField(collapsedReg(block.id), block.collapsed);
  if (block.ref) doc.setField(refReg(block.id), block.ref);
  if (block.bookmark) doc.setField(bookmarkReg(block.id), block.bookmark as unknown as Json);
  const order = rgaList(doc, ORDER).filter((x) => x !== block.id);
  const at = Math.max(0, Math.min(index, order.length));
  doc.setList(ORDER, [...order.slice(0, at), block.id, ...order.slice(at)]);
}

/** Store (or update) the fetched OG metadata for a `bookmark` block. */
export function setBlockBookmark(doc: WalDocument, id: string, meta: BookmarkMeta): void {
  doc.setField(bookmarkReg(id), meta as unknown as Json);
}
