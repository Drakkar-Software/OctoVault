import { useMemo } from 'react';

import { useObjectContent, useWalMutator } from './use-object-content';
import * as page from '@drakkar.software/octovault-sdk';
import type { Block, BlockType, BookmarkMeta, NewBlock } from '@drakkar.software/octovault-sdk';
import type { WalDocument } from '@drakkar.software/starfish-wal';

export type { Block, BlockType, BookmarkMeta, NewBlock } from '@drakkar.software/octovault-sdk';

export interface PageHook {
  blocks: Block[];
  ready: boolean;
  /** The underlying WAL document (non-null once open). Exposed so table/comments
   *  hooks can share this doc without opening a second WAL lifecycle. */
  doc: WalDocument | null;
  /** WAL version counter — bumps on every mutation and pull; use as useMemo dep. */
  version: number;
  /** Generic WAL mutator — apply `fn` to the open doc and schedule a debounced
   *  commit. Returns the function's return value, or undefined when the doc is not
   *  yet open. Equivalent to the internal `mut` in each mutation binding. */
  mutate: <T>(fn: (d: WalDocument) => T) => T | undefined;
  opening: boolean;
  openError: string | null;
  offline: boolean;
  reload: () => void;
  /** Returns the new block id (or undefined before the doc is open). */
  appendBlock: (init?: NewBlock) => string | undefined;
  insertBlock: (index: number, init?: NewBlock) => string | undefined;
  setBlockText: (id: string, text: string) => void;
  setBlockType: (id: string, type: BlockType) => void;
  setBlockChecked: (id: string, checked: boolean) => void;
  setBlockIndent: (id: string, indent: number) => void;
  setBlockCollapsed: (id: string, collapsed: boolean) => void;
  /** Point a `page` block at the child Object it links to. */
  setBlockRef: (id: string, ref: string) => void;
  removeBlock: (id: string) => void;
  moveBlock: (id: string, toIndex: number) => void;
  /** Enter-to-split: rewrite `id` to `head`, insert the tail block below it as ONE
   *  op batch. Returns the new block id (null/undefined when the doc isn't open
   *  or the block vanished under a concurrent edit). */
  splitBlock: (id: string, head: string, init?: NewBlock) => string | null | undefined;
  /** Backspace-at-start: fold `id` into the previous block; returns the survivor
   *  and the caret seam. `textOverride` carries the field's live value. */
  mergeBlockIntoPrevious: (id: string, textOverride?: string) => { prevId: string; offset: number } | null | undefined;
  duplicateBlock: (id: string) => string | null | undefined;
  /** Undo for a structural delete — re-insert with the ORIGINAL id at `index`. */
  restoreBlock: (index: number, block: Block) => void;
  /** Store (or update) the fetched OG metadata for a `bookmark` block. */
  setBlockBookmark: (id: string, meta: BookmarkMeta) => void;
}

/**
 * One `page` Object's block content, backed by a {@link WalDocument} (CRDT op-log).
 * Thin wrapper over {@link useObjectContent} + {@link page-content} ops.
 * Concurrent edits converge (per-block char-RGA text).
 */
export function usePage(spaceId: string, pageId: string, opts: { enabled?: boolean } = {}): PageHook {
  const { walDoc: doc, ready, version, touch, opening, openError, offline, reload } = useObjectContent(
    spaceId,
    pageId,
    'append',
    opts,
  );

  // `version` is the recompute trigger — the WalDocument is mutated in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const blocks = useMemo<Block[]>(() => (doc ? page.readBlocks(doc) : []), [doc, version]);

  const mut = useWalMutator(doc, touch);

  return {
    blocks,
    ready,
    opening,
    openError,
    offline,
    reload,
    doc,
    version,
    mutate: mut,
    appendBlock: (init) => mut((d) => page.appendBlock(d, init)),
    insertBlock: (index, init) => mut((d) => page.insertBlock(d, index, init)),
    setBlockText: (id, text) => mut((d) => page.setBlockText(d, id, text)),
    setBlockType: (id, type) => mut((d) => page.setBlockType(d, id, type)),
    setBlockChecked: (id, checked) => mut((d) => page.setBlockChecked(d, id, checked)),
    setBlockIndent: (id, indent) => mut((d) => page.setBlockIndent(d, id, indent)),
    setBlockCollapsed: (id, collapsed) => mut((d) => page.setBlockCollapsed(d, id, collapsed)),
    setBlockRef: (id, ref) => mut((d) => page.setBlockRef(d, id, ref)),
    removeBlock: (id) => mut((d) => page.removeBlock(d, id)),
    moveBlock: (id, toIndex) => mut((d) => page.moveBlock(d, id, toIndex)),
    splitBlock: (id, head, init) => mut((d) => page.splitBlock(d, id, head, init)),
    mergeBlockIntoPrevious: (id, textOverride) => mut((d) => page.mergeBlockIntoPrevious(d, id, textOverride)),
    duplicateBlock: (id) => mut((d) => page.duplicateBlock(d, id)),
    restoreBlock: (index, block) => mut((d) => page.restoreBlock(d, index, block)),
    setBlockBookmark: (id, meta) => mut((d) => page.setBlockBookmark(d, id, meta)),
  };
}
