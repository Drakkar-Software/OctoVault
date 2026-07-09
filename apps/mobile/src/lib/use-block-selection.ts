import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { View as ViewType } from 'react-native';
import { Platform } from 'react-native';

import {
  readBlocks,
  insertBlock as insertBlockOp,
  removeBlock as removeBlockOp,
  restoreBlock as restoreBlockOp,
  type Block,
  type ClipBlock,
} from '@drakkar.software/octovault-sdk';
import type { PageHook } from './use-page';
import { clipBlocksFromPayloads, copyBlocks, pasteBlocks, rememberBlocks } from './clipboard';
import { successFeedback, tapFeedback } from './haptics';

/** Pixels a pointer must travel before a press becomes a block-drag (vs a click). */
const DRAG_THRESHOLD = 5;

interface ToastApi {
  show: (t: { message: string; action?: { label: string; onPress: () => void } }) => void;
}

interface Args {
  page: PageHook;
  /** Full block order (live ref). */
  blocksRef: RefObject<Block[]>;
  /** Render-visible blocks in order (live ref). */
  visibleRef: RefObject<Block[]>;
  /** Per-row geometry `{y,h}` relative to the blocks container (drag hit-testing). */
  rowLayouts: RefObject<Map<string, { y: number; h: number }>>;
  /** Ids whose late field-flush must be dropped (shared with PageView's delete path). */
  deadRef: RefObject<Set<string>>;
  /** The blocks container view — its DOM node anchors the web pointer/paste listeners. */
  containerRef: RefObject<ViewType | null>;
  toast: ToastApi;
  /** Open a block for editing (also clears the selection via the editing effect). */
  focusBlock: (id: string) => void;
  /** Close the open editor (entering selection blurs any live field). */
  closeEditor: () => void;
  /** The currently-editing block id (drives invariant: selection ⟺ no editor). */
  editingId: string | null;
  /** Resolve a ref block's child title for external plain-text copy. */
  resolveRefTitle?: (ref: string) => string | undefined;
}

/** Keyboard/pointer modifier snapshot from a press or key event. */
export interface SelMods {
  shift: boolean;
  /** Cmd (mac) / Ctrl — non-contiguous toggle. */
  mod: boolean;
}

/* ─────────────────────────── pure range helpers ────────────────────────────── */

/** Inclusive visible-order span between two block ids (order-independent of which is first). */
export function rangeIds(visible: Block[], aId: string, bId: string): string[] {
  const a = visible.findIndex((b) => b.id === aId);
  const b = visible.findIndex((b) => b.id === bId);
  if (a < 0 || b < 0) return [bId];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return visible.slice(lo, hi + 1).map((x) => x.id);
}

/**
 * Expand a set of selected (visible) ids to the full-order run they govern: a
 * selected COLLAPSED toggle drags its hidden deeper-indented children with it, so
 * copy/cut/delete never orphan them. Returns blocks in document order, de-duplicated.
 */
export function expandSelection(all: Block[], selected: Set<string>): Block[] {
  const out: Block[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < all.length; i++) {
    const b = all[i]!;
    if (!selected.has(b.id) && !seen.has(b.id)) continue;
    if (!seen.has(b.id)) {
      out.push(b);
      seen.add(b.id);
    }
    if (b.type === 'toggle' && b.collapsed) {
      const ind = b.indent ?? 0;
      for (let j = i + 1; j < all.length && (all[j]!.indent ?? 0) > ind; j++) {
        if (!seen.has(all[j]!.id)) {
          out.push(all[j]!);
          seen.add(all[j]!.id);
        }
      }
    }
  }
  return out;
}

/** The block id whose row contains `localY` (container-relative), clamped to the
 *  nearest row above/below when the pointer is in a gap or past the ends. */
export function hitTestY(rowLayouts: Map<string, { y: number; h: number }>, visible: Block[], localY: number): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const b of visible) {
    const r = rowLayouts.get(b.id);
    if (!r) continue;
    if (localY >= r.y && localY <= r.y + r.h) return b.id;
    const dist = localY < r.y ? r.y - localY : localY - (r.y + r.h);
    if (dist < bestDist) {
      bestDist = dist;
      best = b.id;
    }
  }
  return best;
}

/* ─────────────────────────────── the hook ──────────────────────────────────── */

export function useBlockSelection({
  page,
  blocksRef,
  visibleRef,
  rowLayouts,
  deadRef,
  containerRef,
  toast,
  focusBlock,
  closeEditor,
  editingId,
  resolveRefTitle,
}: Args) {
  const [selection, setSelection] = useState<Set<string>>(new Set());
  /** Native only: long-press → menu → "Select" enters a tap-to-toggle mode. */
  const [selectionMode, setSelectionMode] = useState(false);
  const anchorRef = useRef<string | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  /** Modifier state captured at pointer-down (web) — RN-Web `Pressable.onPress`
   *  events don't carry `shiftKey`/`metaKey`, so we snapshot it just before. */
  const modsRef = useRef<SelMods>({ shift: false, mod: false });

  const setSel = useCallback(
    (ids: Iterable<string>) => {
      const next = new Set(ids);
      if (next.size) closeEditor();
      setSelection(next);
    },
    [closeEditor],
  );

  const clear = useCallback(() => {
    anchorRef.current = null;
    setSelectionMode(false);
    setSelection((cur) => (cur.size ? new Set() : cur));
  }, []);

  // Invariant: an open editor and a non-empty selection are mutually exclusive.
  useEffect(() => {
    if (editingId) clear();
  }, [editingId, clear]);

  // Deselecting the last block on native must also leave select mode — otherwise the
  // action bar unmounts (count 0) while taps still toggle, stranding the user.
  useEffect(() => {
    if (selectionMode && selection.size === 0) setSelectionMode(false);
  }, [selectionMode, selection]);

  /* ── block/order collection ───────────────────────────────────────────────── */

  /** Selected blocks (order-expanded), shaped for the clipboard: tables dropped
   *  (their content lives in separate registers — a v1 limitation), ref blocks
   *  carry their child title as text so external paste reads meaningfully. */
  const collectForClipboard = useCallback((): Block[] => {
    const expanded = expandSelection(blocksRef.current ?? [], selectionRef.current);
    return expanded
      .filter((b) => b.type !== 'table')
      .map((b) => (b.ref && resolveRefTitle ? { ...b, text: resolveRefTitle(b.ref) ?? b.text } : b));
  }, [blocksRef, resolveRefTitle]);

  /* ── actions ──────────────────────────────────────────────────────────────── */

  /** Remove an explicit set of blocks in one batch, with an Undo toast. Callers pass
   *  exactly the run they mean to drop (delete = whole selection; cut = only what was
   *  copied) so cut never destroys a block it couldn't carry to the clipboard. */
  const deleteBlocks = useCallback(
    (blocks: Block[]) => {
      if (!blocks.length) return;
      const all = blocksRef.current ?? [];
      // Ascending-index snapshots of the ORIGINAL blocks (not any clipboard-shaped
      // copy) so Undo re-inserts each at its slot with faithful text.
      const snaps = blocks
        .map(({ id }) => {
          const index = all.findIndex((x) => x.id === id);
          return { index, block: all[index] };
        })
        .filter((s): s is { index: number; block: Block } => s.index >= 0 && !!s.block)
        .sort((a, b) => a.index - b.index);
      if (!snaps.length) return;
      successFeedback();
      page.mutate((d) => {
        for (const { block } of snaps) {
          deadRef.current?.add(block.id);
          removeBlockOp(d, block.id);
        }
      });
      clear();
      closeEditor();
      toast.show({
        message: `${snaps.length} block${snaps.length === 1 ? '' : 's'} deleted`,
        action: {
          label: 'Undo',
          onPress: () => {
            page.mutate((d) => {
              for (const { index, block } of snaps) {
                deadRef.current?.delete(block.id);
                restoreBlockOp(d, index, block);
              }
            });
          },
        },
      });
    },
    [blocksRef, deadRef, page, clear, closeEditor, toast],
  );

  const deleteSelected = useCallback(() => {
    deleteBlocks(expandSelection(blocksRef.current ?? [], selectionRef.current));
  }, [deleteBlocks, blocksRef]);

  const copy = useCallback(async () => {
    const expanded = expandSelection(blocksRef.current ?? [], selectionRef.current);
    const blocks = collectForClipboard();
    const skipped = expanded.length - blocks.length; // tables (excluded from rich copy)
    if (!blocks.length) {
      if (skipped > 0) toast.show({ message: `Tables can’t be copied` });
      return;
    }
    const ok = await copyBlocks(blocks);
    if (!ok) return;
    const tail = skipped > 0 ? ` (${skipped} table${skipped === 1 ? '' : 's'} skipped)` : '';
    toast.show({ message: `${blocks.length} block${blocks.length === 1 ? '' : 's'} copied${tail}` });
  }, [blocksRef, collectForClipboard, toast]);

  const cut = useCallback(async () => {
    const blocks = collectForClipboard();
    if (!blocks.length) return;
    await copyBlocks(blocks);
    // Delete ONLY what we copied — a table (excluded from the clipboard) is left in
    // place rather than silently destroyed by a cut it never reached the clipboard on.
    deleteBlocks(blocks);
  }, [collectForClipboard, deleteBlocks]);

  /**
   * Insert `clips` into the doc in ONE `page.mutate` batch, indents rebased onto the
   * paste site. `replace` (paste) deletes the current selection first and lands at its
   * slot; otherwise (duplicate) it inserts after `afterId` keeping the originals.
   * Focuses the last inserted block (which clears the selection).
   */
  const applyPaste = useCallback(
    (clips: ClipBlock[], opts?: { replace?: boolean; afterId?: string; baseIndent?: number }) => {
      if (!clips.length) return;
      const replace = opts?.replace ?? true;
      const all = blocksRef.current ?? [];
      const toRemove = replace && selectionRef.current.size ? expandSelection(all, selectionRef.current) : [];
      let anchorId: string | undefined;
      let baseIndent: number;
      if (toRemove.length) {
        const firstIdx = all.findIndex((x) => x.id === toRemove[0]!.id);
        anchorId = firstIdx > 0 ? all[firstIdx - 1]?.id : undefined;
        // The removed block's own depth (0 when its indent register is cleared) — NOT
        // the previous block's, which would wrongly nest a paste-over at depth 0.
        baseIndent = toRemove[0]!.indent ?? 0;
      } else if (opts?.afterId) {
        anchorId = opts.afterId;
        baseIndent = opts.baseIndent ?? all.find((x) => x.id === opts.afterId)?.indent ?? 0;
      } else {
        anchorId = all[all.length - 1]?.id;
        baseIndent = 0;
      }
      const minPasted = Math.min(...clips.map((c) => c.indent));
      const newIds: string[] = [];
      page.mutate((d) => {
        for (const b of toRemove) {
          deadRef.current?.add(b.id);
          removeBlockOp(d, b.id);
        }
        const liveOrder = readBlocks(d).map((b) => b.id);
        const ai = anchorId ? liveOrder.indexOf(anchorId) : -1;
        let at = ai >= 0 ? ai + 1 : 0;
        for (const c of clips) {
          const id = insertBlockOp(d, at++, {
            type: c.type,
            text: c.text,
            checked: c.checked,
            indent: Math.max(0, c.indent - minPasted + baseIndent) || undefined,
            ref: c.ref,
          });
          newIds.push(id);
        }
      });
      clear();
      const last = newIds[newIds.length - 1];
      if (last) focusBlock(last);
    },
    [blocksRef, deadRef, page, clear, focusBlock],
  );

  const paste = useCallback(async () => {
    const clips = await pasteBlocks();
    if (clips?.length) applyPaste(clips);
  }, [applyPaste]);

  /** Insert copies of the selection directly after it (keeps the originals). Ref
   *  blocks re-link the same child (like `duplicateBlock`); tables are skipped. */
  const duplicate = useCallback(() => {
    const expanded = expandSelection(blocksRef.current ?? [], selectionRef.current).filter((b) => b.type !== 'table');
    if (!expanded.length) return;
    const clips: ClipBlock[] = expanded.map((b) => ({ type: b.type, text: b.text, indent: b.indent ?? 0, checked: b.checked, ref: b.ref }));
    const base = Math.min(...expanded.map((b) => b.indent ?? 0));
    applyPaste(clips, { replace: false, afterId: expanded[expanded.length - 1]!.id, baseIndent: base });
  }, [blocksRef, applyPaste]);

  /* ── gesture entry points (wired into BlockRow) ───────────────────────────── */

  const toggle = useCallback(
    (id: string) => {
      setSelection((cur) => {
        const next = new Set(cur);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (next.size) closeEditor();
        return next;
      });
      anchorRef.current = id;
    },
    [closeEditor],
  );

  /** Web Shift+grip — select just this block. */
  const selectOnly = useCallback(
    (id: string) => {
      anchorRef.current = id;
      setSel([id]);
    },
    [setSel],
  );

  /** A read-block press. Returns true when it was consumed as a selection gesture
   *  (caller must NOT open the editor); false to fall through to editing. Reads the
   *  modifier snapshot captured at pointer-down (web). */
  const onBlockPress = useCallback(
    (id: string): boolean => {
      if (selectionMode) {
        tapFeedback();
        toggle(id);
        return true;
      }
      const mods = modsRef.current;
      if (mods.shift) {
        // Extend from the anchor, or start a fresh selection here when there is none.
        if (anchorRef.current) setSel(rangeIds(visibleRef.current ?? [], anchorRef.current, id));
        else selectOnly(id);
        return true;
      }
      if (mods.mod) {
        toggle(id);
        return true;
      }
      // Plain press: fall through to editing (the editing effect clears any selection).
      return false;
    },
    [selectionMode, toggle, setSel, selectOnly, visibleRef],
  );

  /** Toggle a single non-editable block (divider) in/out of the selection. */
  const toggleOnly = useCallback(
    (id: string) => {
      if (selectionRef.current.has(id) && selectionRef.current.size === 1) clear();
      else selectOnly(id);
    },
    [clear, selectOnly],
  );

  /** Current pointer-modifier snapshot (for the gutter grip's Shift+click select). */
  const peekMods = useCallback(() => modsRef.current, []);

  /** Native "Select" handle-menu item — enter tap-to-toggle mode on this block. */
  const enterSelectMode = useCallback(
    (id: string) => {
      tapFeedback();
      setSelectionMode(true);
      anchorRef.current = id;
      setSel([id]);
    },
    [setSel],
  );

  /* ── web: pointer-drag selection ──────────────────────────────────────────── */

  // Latest handlers behind a ref so the listeners bind once, not every render.
  const api = useRef({ setSel, clear, deleteSelected, deleteBlocks, copy, cut, paste, applyPaste, collectForClipboard });
  api.current = { setSel, clear, deleteSelected, deleteBlocks, copy, cut, paste, applyPaste, collectForClipboard };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node) return;

    let startId: string | null = null;
    let startY = 0;
    let startX = 0;
    let dragging = false;
    /** Swallow the click the browser fires after a drag — otherwise it reaches a
     *  block's onPress and opens the editor, clearing the just-made selection. */
    let suppressClick = false;

    const localY = (clientY: number) => clientY - node.getBoundingClientRect().top;
    const idAt = (clientY: number) => hitTestY(rowLayouts.current ?? new Map(), visibleRef.current ?? [], localY(clientY));

    const onDown = (e: PointerEvent) => {
      // A fresh press starts clean — never let a stale suppress-flag eat a real click
      // (e.g. a drag that ended without a trailing click).
      suppressClick = false;
      if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey) return;
      const el = e.target as { tagName?: string; isContentEditable?: boolean } | null;
      const tag = el?.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return; // editing the field
      startId = idAt(e.clientY);
      startX = e.clientX;
      startY = e.clientY;
      dragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (startId == null) return;
      if (!dragging) {
        if (Math.abs(e.clientY - startY) + Math.abs(e.clientX - startX) < DRAG_THRESHOLD) return;
        dragging = true;
        anchorRef.current = startId;
        node.setPointerCapture?.(e.pointerId);
      }
      e.preventDefault();
      const focusId = idAt(e.clientY);
      if (focusId) api.current.setSel(rangeIds(visibleRef.current ?? [], startId, focusId));
    };
    const endDrag = (e: PointerEvent) => {
      if (dragging) {
        node.releasePointerCapture?.(e.pointerId);
        suppressClick = true;
      }
      startId = null;
      dragging = false;
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    };

    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', endDrag);
    node.addEventListener('pointercancel', endDrag);
    node.addEventListener('click', onClickCapture, true);
    return () => {
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', endDrag);
      node.removeEventListener('pointercancel', endDrag);
      node.removeEventListener('click', onClickCapture, true);
    };
  }, [containerRef, rowLayouts, visibleRef]);

  /* ── web: keyboard + clipboard events ─────────────────────────────────────── */

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const active = () => selectionRef.current.size > 0;
    const editableTarget = (t: EventTarget | null) => {
      const el = t as { tagName?: string; isContentEditable?: boolean } | null;
      const tag = el?.tagName?.toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || !!el?.isContentEditable;
    };

    // Snapshot modifiers just before a Pressable's onPress fires (RN-Web strips them).
    const onPointerDownCapture = (e: PointerEvent) => {
      modsRef.current = { shift: e.shiftKey, mod: e.metaKey || e.ctrlKey };
    };
    window.addEventListener('pointerdown', onPointerDownCapture, true);

    const onKey = (e: KeyboardEvent) => {
      // A live block selection can coexist with a focused NON-block field (page title):
      // let that input keep its own Backspace/Escape instead of deleting the selection.
      if (!active() || editableTarget(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        api.current.clear();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        api.current.deleteSelected();
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!active() || editableTarget(e.target)) return;
      const blocks = api.current.collectForClipboard();
      if (!blocks.length) return;
      e.preventDefault();
      const { plain, html } = rememberBlocks(blocks);
      e.clipboardData?.setData('text/html', html);
      e.clipboardData?.setData('text/plain', plain);
    };
    const onCut = (e: ClipboardEvent) => {
      if (!active() || editableTarget(e.target)) return;
      const blocks = api.current.collectForClipboard();
      if (!blocks.length) return;
      e.preventDefault();
      const { plain, html } = rememberBlocks(blocks);
      e.clipboardData?.setData('text/html', html);
      e.clipboardData?.setData('text/plain', plain);
      // Delete ONLY the copied set (tables excluded) so a cut never destroys a block
      // that never reached the clipboard.
      api.current.deleteBlocks(blocks);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!active() || editableTarget(e.target)) return;
      const html = e.clipboardData?.getData('text/html') ?? '';
      const plain = e.clipboardData?.getData('text/plain') ?? '';
      const clips = clipBlocksFromPayloads(html, plain);
      if (clips?.length) {
        e.preventDefault();
        api.current.applyPaste(clips);
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('pointerdown', onPointerDownCapture, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  const isSelected = useCallback((id: string) => selection.has(id), [selection]);

  return useMemo(
    () => ({
      selection,
      selectionMode,
      count: selection.size,
      isSelected,
      onBlockPress,
      selectOnly,
      toggleOnly,
      peekMods,
      enterSelectMode,
      clear,
      copy,
      cut,
      paste,
      duplicate,
      deleteSelected,
    }),
    [selection, selectionMode, isSelected, onBlockPress, selectOnly, toggleOnly, peekMods, enterSelectMode, clear, copy, cut, paste, duplicate, deleteSelected],
  );
}

export type BlockSelectionApi = ReturnType<typeof useBlockSelection>;
