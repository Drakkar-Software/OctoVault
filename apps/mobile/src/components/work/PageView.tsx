import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { View as ViewType } from 'react-native';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { layout, radii, spacing, type as typeScale } from '@/theme';
import {
  continuationType,
  endsListOnEmptyEnter,
  filterBlockTypes,
  isMultiline,
  listOrdinals,
  mdShortcut,
  monoFor,
  placeholderFor,
  variantFor,
  type BlockTypeDef,
  type MdShortcutMatch,
} from '@drakkar.software/octovault-sdk';
import { REF_BLOCK_TYPES, visibleBlocks } from '@drakkar.software/octovault-sdk';
import { usePage, type Block, type BlockType } from '@/lib/use-page';
import { usePageComments } from '@/lib/use-comments';
import { iconForNode } from '@drakkar.software/octovault-sdk';
import { useSpaceObjects } from '@/lib/space-objects-context';
import type { ObjectNode } from '@drakkar.software/octovault-sdk';
import { useCopy } from '@/lib/clipboard';
import { useHover, useRowHover } from '@/lib/use-hover';
import { useResponsive } from '@/lib/use-responsive';
import { useTheme } from '@/lib/use-theme';
import { AutosaveField, type FieldSelection, type KeyMods } from '@/components/ui/AutosaveField';
import { Callout } from '@/components/ui/Callout';
import { EmojiPicker } from '@/components/ui/EmojiPicker';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { Txt } from '@/components/ui/Txt';
import { BlockHandleMenu, InsertBlockMenu, SlashMenu, flattenBySection } from '@/components/work/BlockTypeMenu';
import { ObjectHero } from '@/components/work/ObjectHero';
import { AttachmentBlock } from '@/components/work/AttachmentBlock';
import { BookmarkBlock } from '@/components/work/BookmarkBlock';
import { BlockComments } from '@/components/work/BlockComments';
import { useObjectFiles } from '@/lib/use-object-files';
import type { BookmarkMeta } from '@/lib/use-page';

/** Where the caret should land when a block (re)opens for editing. */
const SEL_START: FieldSelection = { start: 0, end: 0 };
const selEnd = (text: string): FieldSelection => ({ start: text.length, end: text.length });

interface PageViewProps {
  spaceId: string;
  objectId: string;
  emoji?: string;
  title?: string;
  /** Quiet hero meta ("Edited 2h ago"), from the index node's `updatedAt`. */
  subtitle?: string;
  onRenameTitle?: (text: string) => void;
  /** Persist an icon change from the hero's EmojiPicker (`null` clears it). */
  onChangeEmoji?: (emoji: string | null) => void;
  /** Create flows: mount with the hero title already editing (empty, "Untitled"
   *  placeholder) so the first keystroke names the page. */
  focusTitle?: boolean;
  /**
   * Native editing accessory: while a block is being edited on iOS/Android the
   * editor hands the route a rendered toolbar (insert / turn-into / indent /
   * move / done) to pin as the StackScreen footer — that slot already
   * keyboard-avoids, which this component (inside the scroll content) cannot.
   * Called with `null` when editing ends. Never called on web.
   */
  onToolbar?: (node: ReactNode | null) => void;
}

/**
 * Live block editor for one `page` Object — a Notion-style list of typed blocks
 * backed by a {@link usePage} WAL/CRDT document. One block is editable at a time
 * (the seed-once {@link AutosaveField} protects an open edit from being clobbered
 * by a background fold); everything around that field is built so the swap is
 * imperceptible: identical read/edit metrics, Enter splits at the caret,
 * Backspace-at-start merges, ArrowUp/Down travel across blocks, and the slash
 * menu filters at the caret WITHOUT unmounting the field.
 *
 * CRDT hygiene (the part that's invisible but load-bearing): transient text —
 * a live "/h2" query, a just-converted "# " prefix, the pre-split body — must
 * never reach the append-only WAL. Three guards enforce it: `slashRef` drops
 * commits while the menu is open, `suppressRef` drops the one exact raw string
 * a conversion consumed, and `deadRef` drops the unmount flush of a block that
 * was merged/deleted while its field was still mounted.
 */
export function PageView({ spaceId, objectId, emoji, title, subtitle, onRenameTitle, onChangeEmoji, focusTitle, onToolbar }: PageViewProps) {
  const page = usePage(spaceId, objectId);
  const comments = usePageComments(spaceId, objectId);
  const router = useRouter();
  const toast = useToast();
  const { isWide } = useResponsive();
  const { objects } = useSpaceObjects();
  const { attachBlob } = useObjectFiles(spaceId);

  /** The one open editor: `seed` forces a remount (re-seed) of the same block's
   *  field after a conversion; `selection` places the caret (merge seam, travel). */
  const [editing, setEditing] = useState<{ id: string; seed: number; selection?: FieldSelection } | null>(null);
  const seedRef = useRef(0);
  /** Slash command state; mirrored in a ref so commit guards (which can fire
   *  during the same tick) never read a stale closure. */
  const [slash, setSlash] = useState<{ id: string; query: string; index: number } | null>(null);
  const slashRef = useRef<typeof slash>(null);
  /** id → the ONE exact raw string a conversion consumed (md prefix / slash
   *  query) whose late flush must be dropped; cleared on the next macrotask. */
  const suppressRef = useRef(new Map<string, string>());
  /** Blocks removed while their field was mounted — their unmount flush is junk. */
  const deadRef = useRef(new Set<string>());
  const [handleMenu, setHandleMenu] = useState<{ id: string; anchor: RefObject<ViewType | null> } | null>(null);
  const [insertMenu, setInsertMenu] = useState<{ afterId: string; anchor: RefObject<ViewType | null> } | null>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const [selectedDivider, setSelectedDivider] = useState<string | null>(null);
  /** The block whose discussion panel/sheet is open (null = closed). */
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const iconAnchorRef = useRef<ViewType | null>(null);
  /** Per-row anchors (handle menus from the native toolbar) + row geometry
   *  (the slash card hangs off the active row inside the blocks container). */
  const rowRefs = useRef(new Map<string, ViewType | null>());
  const rowLayouts = useRef(new Map<string, { y: number; h: number }>());

  const blocks = page.blocks;
  const visible = useMemo(() => visibleBlocks(blocks), [blocks]);
  const ordinals = useMemo(() => listOrdinals(visible), [visible]);
  // Structural handlers read through refs so the native-toolbar effect (and any
  // setTimeout-deferred work) always operates on the freshest projection.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  /** Index children rendered as link rows: every `page` block's ref is "claimed";
   *  the rest show in the trailing Sub-pages section so nothing nested is invisible. */
  const unclaimedChildren = useMemo(() => {
    const claimed = new Set(blocks.filter((b) => REF_BLOCK_TYPES.has(b.type) && b.ref).map((b) => b.ref!));
    return objects.nodes.filter((n) => n.parentId === objectId && !claimed.has(n.id));
  }, [blocks, objects.nodes, objectId]);

  const focusBlock = (id: string, selection?: FieldSelection) => {
    seedRef.current += 1;
    setSelectedDivider(null);
    setEditing({ id, seed: seedRef.current, selection });
  };

  const getBlock = (id: string) => blocksRef.current.find((b) => b.id === id);
  const visIndexOf = (id: string) => visibleRef.current.findIndex((b) => b.id === id);

  /** Full-order index for "insert below `id`" — skipping a COLLAPSED toggle's
   *  hidden run so the new block lands visibly after it, not inside it. */
  const insertIndexAfter = (id: string): number => {
    const all = blocksRef.current;
    const i = all.findIndex((b) => b.id === id);
    if (i < 0) return all.length;
    const b = all[i]!;
    if (b.type === 'toggle' && b.collapsed) {
      const ind = b.indent ?? 0;
      let j = i + 1;
      while (j < all.length && (all[j]!.indent ?? 0) > ind) j++;
      return j;
    }
    return i + 1;
  };

  /* ───────────────────────── commits (with transient-text guards) ───────── */

  const onText = (id: string, t: string) => {
    if (deadRef.current.has(id)) return;
    if (suppressRef.current.get(id) === t) return;
    if (slashRef.current?.id === id && t.startsWith('/')) return;
    page.setBlockText(id, t);
  };

  /** Arm a one-shot drop of `raw` for `id`, released after the imminent unmount
   *  flush (which runs synchronously inside the next React commit) has passed. */
  const suppressOnce = (id: string, raw: string) => {
    suppressRef.current.set(id, raw);
    setTimeout(() => {
      if (suppressRef.current.get(id) === raw) suppressRef.current.delete(id);
    }, 0);
  };

  /* ───────────────────────── slash command ───────────────────────────────── */

  const closeSlash = () => {
    slashRef.current = null;
    setSlash(null);
  };

  const selectSlash = (defOverride?: BlockTypeDef) => {
    const s = slashRef.current;
    if (!s) return;
    const flat = flattenBySection(filterBlockTypes(s.query));
    const def = defOverride ?? flat[Math.max(0, Math.min(s.index, flat.length - 1))];
    closeSlash();
    if (!def) return;
    // The "/query" the user typed was navigation, not content — drop its flush.
    suppressOnce(s.id, `/${s.query}`);
    if (REF_BLOCK_TYPES.has(def.type)) {
      // image/file: stay inline (picker opens immediately, no navigation).
      if (def.type === 'image' || def.type === 'file') {
        insertAttachment(s.id, def.type);
      } else {
        convertToRefBlock(s.id, def.type);
      }
      return;
    }
    if (def.type === 'divider') {
      page.setBlockType(s.id, 'divider');
      page.setBlockText(s.id, '');
      setEditing(null);
      const nid = page.insertBlock(insertIndexAfter(s.id), { type: 'paragraph', indent: getBlock(s.id)?.indent });
      if (nid) focusBlock(nid, SEL_START);
      return;
    }
    // Type + text change in ONE touch batch; the seed bump remounts the field
    // empty with the new type's placeholder — no unmount round-trip, no flash.
    page.setBlockType(s.id, def.type);
    page.setBlockText(s.id, '');
    focusBlock(s.id, SEL_START);
  };

  /* ───────────────────────── markdown shortcuts ──────────────────────────── */

  const applyMdShortcut = (b: Block, raw: string, md: MdShortcutMatch) => {
    suppressOnce(b.id, raw);
    if (md.type === 'divider') {
      // A divider holds no text — the (usually empty) remainder gets a fresh
      // paragraph below so nothing typed is lost.
      page.setBlockType(b.id, 'divider');
      page.setBlockText(b.id, '');
      const nid = page.insertBlock(insertIndexAfter(b.id), { type: 'paragraph', text: md.rest, indent: b.indent });
      if (nid) focusBlock(nid, selEnd(md.rest));
      else setEditing(null);
      return;
    }
    page.setBlockType(b.id, md.type);
    page.setBlockText(b.id, md.rest);
    if (md.checked) page.setBlockChecked(b.id, true);
    focusBlock(b.id, selEnd(md.rest));
  };

  /** Live keystrokes from the open field: maintain the slash state, fire
   *  markdown conversions. Code blocks opt out of both (literal "/" and "#"). */
  const onBlockChange = (b: Block, text: string) => {
    if (b.type === 'code') return;
    if (text.startsWith('/')) {
      const next = { id: b.id, query: text.slice(1), index: 0 };
      slashRef.current = next;
      setSlash(next);
      return;
    }
    if (slashRef.current?.id === b.id) closeSlash();
    const md = mdShortcut(text);
    if (md && md.type !== b.type) applyMdShortcut(b, text, md);
  };

  /* ───────────────────────── Enter / Backspace / arrows ──────────────────── */

  const onEnterBlock = (b: Block, head: string, tail: string) => {
    if (slashRef.current?.id === b.id) {
      // Native fallback — web routes Enter through onKeyDownCapture instead.
      selectSlash();
      return;
    }
    const cur = getBlock(b.id) ?? b;
    if (head === '' && tail === '' && endsListOnEmptyEnter(cur.type)) {
      // Enter on an empty list item ends the list: outdent first, then demote.
      if ((cur.indent ?? 0) > 0) page.setBlockIndent(b.id, (cur.indent ?? 0) - 1);
      else page.setBlockType(b.id, 'paragraph');
      return;
    }
    const nid = page.splitBlock(b.id, head, { type: continuationType(cur.type), text: tail, indent: cur.indent });
    if (nid) focusBlock(nid, SEL_START);
  };

  /**
   * The Backspace ladder (Notion's): indented → outdent; typed → demote to
   * paragraph; paragraph → merge into the previous block (a preceding divider /
   * page link is deleted instead — there is nothing to merge into). `live` is
   * the field's on-screen value so the merge can never resurrect stale text;
   * it is '' on the legacy empty-block delete, which the same merge handles
   * (prev keeps its text, caret lands at its end).
   */
  const structuralBackspace = (id: string, live: string) => {
    const cur = getBlock(id);
    if (!cur) return;
    if ((cur.indent ?? 0) > 0) {
      page.setBlockIndent(id, (cur.indent ?? 0) - 1);
      return;
    }
    if (cur.type !== 'paragraph') {
      page.setBlockType(id, 'paragraph');
      return;
    }
    const vi = visIndexOf(id);
    const prev = vi > 0 ? visibleRef.current[vi - 1] : undefined;
    if (!prev) return;
    if (prev.type === 'divider' || prev.type === 'page' || prev.type === 'image' || prev.type === 'file' || prev.type === 'bookmark') {
      page.removeBlock(prev.id);
      return;
    }
    // Merge only into the TRUE order-previous block: a hidden (collapsed) run in
    // between would otherwise swallow the text invisibly.
    const all = blocksRef.current;
    const fi = all.findIndex((x) => x.id === id);
    if (all[fi - 1]?.id !== prev.id) return;
    deadRef.current.add(id);
    const res = page.mergeBlockIntoPrevious(id, live);
    if (res) focusBlock(res.prevId, { start: res.offset, end: res.offset });
    else setEditing(null);
  };

  /** Editable neighbour for caret travel (dividers/page links have no field). */
  const editableNeighbour = (id: string, dir: 'up' | 'down'): Block | undefined => {
    const vis = visibleRef.current;
    let i = vis.findIndex((b) => b.id === id);
    if (i < 0) return undefined;
    const step = dir === 'up' ? -1 : 1;
    for (i += step; i >= 0 && i < vis.length; i += step) {
      const b = vis[i]!;
      if (b.type !== 'divider' && b.type !== 'page' && b.type !== 'image' && b.type !== 'file' && b.type !== 'bookmark') return b;
    }
    return undefined;
  };

  const onArrowBoundary = (b: Block, dir: 'up' | 'down'): boolean => {
    if (slashRef.current?.id === b.id) return false; // capture owns arrows while slash is open
    const target = editableNeighbour(b.id, dir);
    if (!target) return false;
    focusBlock(target.id, dir === 'up' ? selEnd(target.text) : SEL_START);
    return true;
  };

  const indentBlock = (id: string, delta: 1 | -1) => {
    const cur = getBlock(id);
    if (!cur) return;
    const ind = cur.indent ?? 0;
    if (delta < 0) {
      if (ind > 0) page.setBlockIndent(id, ind - 1);
      return;
    }
    const vi = visIndexOf(id);
    const prev = vi > 0 ? visibleRef.current[vi - 1] : undefined;
    if (!prev) return;
    // Clamp to one deeper than the block above — you can't nest under nothing.
    page.setBlockIndent(id, Math.min(ind + 1, (prev.indent ?? 0) + 1));
  };

  /* ───────────────────────── structural moves / delete ───────────────────── */

  const moveBlockBy = (id: string, dir: 'up' | 'down') => {
    const vis = visibleRef.current;
    const all = blocksRef.current;
    const vi = vis.findIndex((b) => b.id === id);
    if (vi < 0) return;
    const target = dir === 'up' ? vis[vi - 1] : vis[vi + 1];
    if (!target) return;
    // Compute the destination in the order-without-self space `moveBlock` uses,
    // landing before (up) / after (down) the VISIBLE neighbour — so a move never
    // teleports into a collapsed toggle's hidden run.
    const without = all.filter((b) => b.id !== id);
    const ti = without.findIndex((b) => b.id === target.id);
    if (dir === 'up') {
      page.moveBlock(id, ti);
      return;
    }
    // Moving down past a collapsed toggle: jump its whole governed run, or the
    // block would land hidden inside it.
    let to = ti + 1;
    if (target.type === 'toggle' && target.collapsed) {
      const ind = target.indent ?? 0;
      while (to < without.length && (without[to]!.indent ?? 0) > ind) to++;
    }
    page.moveBlock(id, to);
  };

  const deleteBlockWithUndo = (id: string) => {
    const all = blocksRef.current;
    const idx = all.findIndex((b) => b.id === id);
    const snapshot = all[idx];
    if (!snapshot) return;
    deadRef.current.add(id);
    page.removeBlock(id);
    setEditing((cur) => (cur?.id === id ? null : cur));
    setSelectedDivider((cur) => (cur === id ? null : cur));
    toast.show({
      message: 'Block deleted',
      action: {
        label: 'Undo',
        onPress: () => {
          deadRef.current.delete(id);
          page.restoreBlock(idx, snapshot);
        },
      },
    });
  };

  /* ───────────────────────── sub-pages ───────────────────────────────────── */

  const openObject = (id: string) =>
    router.push({ pathname: '/work/object/[id]', params: { id, spaceId } });

  /** Open a block's discussion and advance its read mark (clears the unread dot). */
  const openComments = (blockId: string) => {
    setCommentsFor(blockId);
    comments.markThreadRead(blockId);
  };

  /** "/Page|Image|File": create a child Object, turn this block into a ref-link,
   *  and navigate into the created object so it can be named / filled. */
  const convertToRefBlock = (blockId: string, type: BlockType) => {
    const isPage = type === 'page';
    const childId = objects.create({
      type,
      title: isPage ? 'Untitled' : '',
      parentId: objectId,
    });
    if (!childId) return;
    page.setBlockType(blockId, type);
    page.setBlockText(blockId, '');
    page.setBlockRef(blockId, childId);
    setEditing(null);
    router.push({
      pathname: '/work/object/[id]',
      params: { id: childId, spaceId, ...(isPage ? { focusTitle: '1' } : {}) },
    });
  };

  /** Insert an image/file ref-block WITHOUT navigating away — stay on the page
   *  so the inline AttachmentBlock renders and opens the OS picker immediately.
   *  On cancel, the block keeps an Upload button (handled by AttachmentBlock). */
  const insertAttachment = (blockId: string, type: 'image' | 'file') => {
    const childId = objects.create({ type, title: '', parentId: objectId });
    if (!childId) return;
    page.setBlockType(blockId, type);
    page.setBlockText(blockId, '');
    page.setBlockRef(blockId, childId);
    setEditing(null);
    // Open the system file picker immediately (decision: picker on insert).
    // attachBlob is a fire-and-forget — cancellation returns silently,
    // real errors are surfaced inside AttachmentBlock's own upload handler.
    void attachBlob(childId, type === 'image');
  };

  /* ───────────────────────── key routing (slash nav + alt-moves) ─────────── */

  const onKeyCapture = (b: Block, key: string, mods: KeyMods): boolean => {
    if (mods.alt && key === 'ArrowUp') {
      moveBlockBy(b.id, 'up');
      return true;
    }
    if (mods.alt && key === 'ArrowDown') {
      moveBlockBy(b.id, 'down');
      return true;
    }
    const s = slashRef.current;
    if (!s || s.id !== b.id) return false;
    const count = flattenBySection(filterBlockTypes(s.query)).length;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (count > 0) {
        const next = { ...s, index: (s.index + (key === 'ArrowDown' ? 1 : count - 1)) % count };
        slashRef.current = next;
        setSlash(next);
      }
      return true;
    }
    if (key === 'Enter' || key === 'Tab') {
      selectSlash();
      return true;
    }
    if (key === 'Escape') {
      // Keep the literal "/query" text (Notion does); commits resume from here.
      closeSlash();
      return true;
    }
    return false;
  };

  /* ───────────────────────── selected divider keyboard delete (web) ──────── */

  useEffect(() => {
    if (Platform.OS !== 'web' || !selectedDivider) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteBlockWithUndo(selectedDivider);
      } else if (e.key === 'Escape') {
        setSelectedDivider(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // deleteBlockWithUndo reads refs; only the selected id matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDivider]);

  /* ───────────────────────── native editing accessory ────────────────────── */

  useEffect(() => {
    if (!onToolbar || Platform.OS === 'web') return;
    const id = editing?.id;
    if (!id || !getBlock(id)) {
      onToolbar(null);
      return;
    }
    onToolbar(
      <PageEditToolbar
        onInsertBelow={() => {
          const cur = getBlock(id);
          const nid = page.insertBlock(insertIndexAfter(id), {
            type: cur ? continuationType(cur.type) : 'paragraph',
            indent: cur?.indent,
          });
          if (nid) focusBlock(nid, SEL_START);
        }}
        onTurnInto={() => setHandleMenu({ id, anchor: { current: rowRefs.current.get(id) ?? null } })}
        onOutdent={() => indentBlock(id, -1)}
        onIndent={() => indentBlock(id, 1)}
        onMoveUp={() => moveBlockBy(id, 'up')}
        onMoveDown={() => moveBlockBy(id, 'down')}
        onDone={() => setEditing(null)}
      />,
    );
    // Handlers read live refs; re-render only when the edited block changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, page.ready]);
  useEffect(() => () => onToolbar?.(null), [onToolbar]);

  /* ───────────────────────── render ──────────────────────────────────────── */

  const onTailPress = () => {
    const last = visible[visible.length - 1];
    if (last && last.type === 'paragraph' && !last.text && editing?.id !== last.id) {
      // Don't stack empties: re-focus the trailing blank paragraph instead.
      focusBlock(last.id, SEL_START);
      return;
    }
    const nid = page.insertBlock(blocks.length, {});
    if (nid) focusBlock(nid, SEL_START);
  };

  const focusFirstBlock = () => {
    const first = visible.find((b) => b.type !== 'divider' && b.type !== 'page' && b.type !== 'image' && b.type !== 'file' && b.type !== 'bookmark');
    if (first) {
      focusBlock(first.id, SEL_START);
      return;
    }
    const nid = page.insertBlock(0, {});
    if (nid) focusBlock(nid, SEL_START);
  };

  const slashTop = (() => {
    if (!slash) return 0;
    const r = rowLayouts.current.get(slash.id);
    return r ? r.y + r.h + spacing.xs : 0;
  })();

  return (
    <View style={styles.wrap}>
      <ObjectHero
        emoji={emoji}
        title={title}
        subtitle={subtitle}
        onChangeTitle={onRenameTitle}
        onPressIcon={onChangeEmoji ? () => setIconOpen(true) : undefined}
        iconAnchorRef={iconAnchorRef}
        leftInset={layout.blockGutterWidth}
        focusTitle={focusTitle}
        onSubmitTitle={focusFirstBlock}
      />
      <EmojiPicker
        visible={iconOpen}
        onClose={() => setIconOpen(false)}
        onSelect={(glyph) => onChangeEmoji?.(glyph)}
        anchorRef={iconAnchorRef}
        current={emoji || null}
      />

      {page.offline ? <Callout tone="info" iconName="info">Offline — showing the last synced version.</Callout> : null}
      {page.openError ? <Callout tone="danger" iconName="alert">{page.openError}</Callout> : null}

      {/* The blocks container is the slash card's positioning context. */}
      <View style={styles.blocks}>
        {visible.map((b) => (
          <BlockRow
            key={b.id}
            block={b}
            ordinal={ordinals.get(b.id)}
            childNode={REF_BLOCK_TYPES.has(b.type) && b.ref ? objects.get(b.ref) : undefined}
            editing={editing?.id === b.id}
            editSeed={editing?.id === b.id ? editing.seed : 0}
            editSelection={editing?.id === b.id ? editing.selection : undefined}
            dividerSelected={selectedDivider === b.id}
            registerRow={(node) => rowRefs.current.set(b.id, node)}
            onLayoutRow={(y, h) => rowLayouts.current.set(b.id, { y, h })}
            onEdit={() => focusBlock(b.id, selEnd(b.text))}
            onClose={() => {
              setEditing((cur) => (cur?.id === b.id ? null : cur));
              // Wide: a blur means the user left the block — drop the slash menu
              // with it. Narrow: the slash SHEET itself blurs the field on open
              // (RN Modal steals focus), so the menu must survive that blur.
              if (isWide && slashRef.current?.id === b.id) closeSlash();
            }}
            onCommitText={(t) => onText(b.id, t)}
            onChange={(t) => onBlockChange(b, t)}
            onEnter={b.type === 'code' ? undefined : (head, tail) => onEnterBlock(b, head, tail)}
            onBackspaceAtStart={(live) => structuralBackspace(b.id, live)}
            onDeleteEmpty={() => structuralBackspace(b.id, '')}
            onArrowBoundary={(dir) => onArrowBoundary(b, dir)}
            onTab={(shift) => indentBlock(b.id, shift ? -1 : 1)}
            onKeyDownCapture={(key, mods) => onKeyCapture(b, key, mods)}
            onToggleChecked={() => page.setBlockChecked(b.id, !b.checked)}
            onToggleCollapsed={() => page.setBlockCollapsed(b.id, !b.collapsed)}
            onPressDivider={() => setSelectedDivider((cur) => (cur === b.id ? null : b.id))}
            onOpenRef={() => (b.ref ? openObject(b.ref) : undefined)}
            onOpenHandle={(anchor) => setHandleMenu({ id: b.id, anchor })}
            onOpenInsert={(anchor) => setInsertMenu({ afterId: b.id, anchor })}
            spaceId={spaceId}
            onBookmarkFetched={(meta) => page.setBlockBookmark(b.id, meta)}
            commentCount={comments.threads.get(b.id)?.comments.length ?? 0}
            commentUnread={comments.unread.has(b.id)}
            onOpenComments={comments.supported ? () => openComments(b.id) : undefined}
          />
        ))}

        {/* Anchored "/" menu — see SlashMenu for why this is NOT a Modal on wide
            screens. Narrow keeps it open past the field blur its Sheet causes. */}
        {slash && (isWide ? editing?.id === slash.id : true) ? (
          <SlashMenu
            visible
            items={filterBlockTypes(slash.query)}
            activeIndex={slash.index}
            top={slashTop}
            onSelect={(def) => selectSlash(def)}
            onClose={closeSlash}
          />
        ) : null}
      </View>

      {unclaimedChildren.length > 0 ? (
        <View style={styles.subPages}>
          <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint" style={styles.subPagesLabel}>
            Sub-pages
          </Txt>
          {unclaimedChildren.map((n) => (
            <ObjectRefRow key={n.id} node={n} blockType="page" onPress={() => openObject(n.id)} />
          ))}
        </View>
      ) : null}

      {!page.ready && page.opening ? <Txt variant="caption" tone="inkFaint">Opening page…</Txt> : null}

      {/* Click the empty area below the last block (and on an empty page) to focus
          the trailing paragraph or append one — `docEditorMinHeight` keeps a
          generous tap surface like a Notion page's empty bottom. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a block"
        disabled={!page.ready}
        onPress={onTailPress}
        style={styles.tail}
      >
        {blocks.length === 0 && page.ready ? (
          <Txt variant="body" tone="inkFaint">Write something, or type ‘/’ for commands…</Txt>
        ) : null}
      </Pressable>

      <InsertBlockMenu
        visible={!!insertMenu}
        anchorRef={insertMenu?.anchor ?? iconAnchorRef}
        onSelect={(def) => {
          const afterId = insertMenu?.afterId;
          setInsertMenu(null);
          if (!afterId) return;
          if (REF_BLOCK_TYPES.has(def.type)) {
            const at = insertIndexAfter(afterId);
            const nid = page.insertBlock(at, { type: 'paragraph' });
            if (!nid) return;
            if (def.type === 'image' || def.type === 'file') {
              insertAttachment(nid, def.type);
            } else {
              convertToRefBlock(nid, def.type);
            }
            return;
          }
          const nid = page.insertBlock(insertIndexAfter(afterId), { type: def.type, indent: getBlock(afterId)?.indent });
          if (nid && def.type !== 'divider') focusBlock(nid, SEL_START);
        }}
        onClose={() => setInsertMenu(null)}
      />

      <BlockHandleMenu
        visible={!!handleMenu}
        anchorRef={handleMenu?.anchor ?? iconAnchorRef}
        currentType={(handleMenu && getBlock(handleMenu.id)?.type) || 'paragraph'}
        canMoveUp={!!handleMenu && visIndexOf(handleMenu.id) > 0}
        canMoveDown={!!handleMenu && visIndexOf(handleMenu.id) < visible.length - 1}
        onDuplicate={
          handleMenu && !REF_BLOCK_TYPES.has(getBlock(handleMenu.id)?.type ?? 'paragraph')
            ? () => {
                const nid = page.duplicateBlock(handleMenu.id);
                setHandleMenu(null);
                if (nid) focusBlock(nid);
              }
            : undefined
        }
        onMoveUp={() => {
          if (handleMenu) moveBlockBy(handleMenu.id, 'up');
          setHandleMenu(null);
        }}
        onMoveDown={() => {
          if (handleMenu) moveBlockBy(handleMenu.id, 'down');
          setHandleMenu(null);
        }}
        onTurnInto={
          handleMenu && !REF_BLOCK_TYPES.has(getBlock(handleMenu.id)?.type ?? 'paragraph')
            ? (def) => {
                const id = handleMenu.id;
                setHandleMenu(null);
                if (REF_BLOCK_TYPES.has(def.type)) return; // guarded out of the list as well
                page.setBlockType(id, def.type);
                if (def.type === 'divider') page.setBlockText(id, '');
              }
            : undefined
        }
        onDelete={() => {
          if (handleMenu) deleteBlockWithUndo(handleMenu.id);
          setHandleMenu(null);
        }}
        onClose={() => setHandleMenu(null)}
      />

      <BlockComments
        visible={commentsFor != null}
        onClose={() => setCommentsFor(null)}
        thread={commentsFor ? comments.threads.get(commentsFor) : undefined}
        currentUserId={comments.currentUserId}
        onAdd={(text) => { if (commentsFor) comments.addComment(commentsFor, text); }}
        onEdit={(commentId, text) => comments.editComment(commentId, text)}
        onRemove={(commentId) => { if (commentsFor) comments.removeComment(commentsFor, commentId); }}
        onResolve={(resolved) => { if (commentsFor) comments.resolveThread(commentsFor, resolved); }}
        onToggleReaction={(commentId, emoji) => comments.toggleReaction(commentId, emoji)}
      />
    </View>
  );
}

/* ─────────────────────────── row ──────────────────────────────────────────── */

interface BlockRowProps {
  block: Block;
  /** 1-based position within its numbered run (numbered blocks only). */
  ordinal?: number;
  /** Live index node a `page` block links to (title/emoji update on rename). */
  childNode?: ObjectNode;
  editing: boolean;
  /** Bumps to force a re-seed of the SAME block's field (md/slash conversion). */
  editSeed: number;
  editSelection?: FieldSelection;
  dividerSelected: boolean;
  registerRow: (node: ViewType | null) => void;
  onLayoutRow: (y: number, h: number) => void;
  onEdit: () => void;
  /** Space id — passed into AttachmentBlock for its upload/decrypt hooks. */
  spaceId: string;
  /** Persist fetched OG metadata for a `bookmark` block into the CRDT. */
  onBookmarkFetched: (meta: BookmarkMeta) => void;
  /** Number of comments on this block (0 hides the persistent count). */
  commentCount: number;
  /** A comment from someone else arrived since this block's discussion was last read. */
  commentUnread: boolean;
  /** Open this block's discussion; omitted when comments aren't supported (hides the tab). */
  onOpenComments?: () => void;
  onClose: () => void;
  onCommitText: (text: string) => void;
  onChange: (text: string) => void;
  onEnter?: (head: string, tail: string) => void;
  onBackspaceAtStart: (live: string) => void;
  onDeleteEmpty: () => void;
  onArrowBoundary: (dir: 'up' | 'down') => boolean;
  onTab: (shift: boolean) => void;
  onKeyDownCapture: (key: string, mods: KeyMods) => boolean;
  onToggleChecked: () => void;
  onToggleCollapsed: () => void;
  onPressDivider: () => void;
  onOpenRef: () => void;
  onOpenHandle: (anchor: RefObject<ViewType | null>) => void;
  onOpenInsert: (anchor: RefObject<ViewType | null>) => void;
}

function BlockRow({
  block,
  ordinal,
  childNode,
  editing,
  editSeed,
  editSelection,
  dividerSelected,
  registerRow,
  onLayoutRow,
  onEdit,
  onClose,
  onCommitText,
  onChange,
  onEnter,
  onBackspaceAtStart,
  onDeleteEmpty,
  onArrowBoundary,
  onTab,
  onKeyDownCapture,
  onToggleChecked,
  onToggleCollapsed,
  onPressDivider,
  onOpenRef,
  onOpenHandle,
  onOpenInsert,
  spaceId,
  onBookmarkFetched,
  commentCount,
  commentUnread,
  onOpenComments,
}: BlockRowProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useRowHover();
  const rowRef = useRef<ViewType | null>(null);
  // Web reveals gutter controls on hover; native has no pointer (`useRowHover` is
  // constant-false), so the actively-edited block reveals them instead — and every
  // row offers long-press as the touch path to the same handle menu.
  const showGutter = hovered || editing;
  const indentPad = (block.indent ?? 0) * layout.blockIndentStep;
  const openHandle = () => onOpenHandle({ current: rowRef.current });
  // Notion-style right-margin comment affordance: persistent once a block has a
  // discussion, hover-revealed otherwise. Hidden entirely when comments aren't
  // supported for the page (`onOpenComments` omitted).
  const commentTab = onOpenComments ? (
    <CommentTab count={commentCount} unread={commentUnread} visible={showGutter} onPress={onOpenComments} />
  ) : null;

  const setRef = (node: ViewType | null) => {
    rowRef.current = node;
    registerRow(node);
  };

  if (block.type === 'divider') {
    return (
      <View
        ref={setRef}
        collapsable={false}
        onLayout={(e) => onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
        style={[styles.row, indentPad ? { marginLeft: indentPad } : null]}
        {...hoverProps}
      >
        <BlockGutter visible={showGutter} onAdd={onOpenInsert} onHandle={onOpenHandle} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dividerSelected ? 'Divider, selected — press Backspace to delete' : 'Select divider'}
          onPress={onPressDivider}
          onLongPress={openHandle}
          style={[styles.dividerHit, dividerSelected ? { backgroundColor: colors.selected, borderRadius: radii.sm } : null]}
        >
          <View style={[styles.rule, { backgroundColor: dividerSelected ? colors.accent : colors.lineSoft }]} />
        </Pressable>
      </View>
    );
  }

  if (block.type === 'bookmark') {
    return (
      <View
        ref={setRef}
        collapsable={false}
        onLayout={(e) => onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
        style={[styles.row, indentPad ? { marginLeft: indentPad } : null]}
        {...hoverProps}
      >
        <BlockGutter visible={showGutter} onAdd={onOpenInsert} onHandle={onOpenHandle} />
        <BookmarkBlock
          text={block.text}
          bookmark={block.bookmark}
          onChangeUrl={(url) => onCommitText(url)}
          onBookmarkFetched={onBookmarkFetched}
        />
        {commentTab}
      </View>
    );
  }

  if (REF_BLOCK_TYPES.has(block.type)) {
    return (
      <View
        ref={setRef}
        collapsable={false}
        onLayout={(e) => onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
        style={[styles.row, indentPad ? { marginLeft: indentPad } : null]}
        {...hoverProps}
      >
        <BlockGutter visible={showGutter} onAdd={onOpenInsert} onHandle={onOpenHandle} />
        {block.type === 'page'
          ? <ObjectRefRow node={childNode} blockType={block.type} onPress={onOpenRef} onLongPress={openHandle} />
          : <AttachmentBlock
              node={childNode}
              blockType={block.type as 'image' | 'file'}
              spaceId={spaceId}
              onOpen={onOpenRef}
              onLongPress={openHandle}
            />
        }
        {commentTab}
      </View>
    );
  }

  return (
    <View
      ref={setRef}
      collapsable={false}
      onLayout={(e) => onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      style={[styles.row, indentPad ? { marginLeft: indentPad } : null]}
      {...hoverProps}
    >
      <BlockGutter visible={showGutter} onAdd={onOpenInsert} onHandle={onOpenHandle} />

      {block.type === 'todo' ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!block.checked }}
          accessibilityLabel={block.checked ? 'Mark not done' : 'Mark done'}
          onPress={onToggleChecked}
          hitSlop={10}
          style={styles.marker}
        >
          <Icon
            name={block.checked ? 'square-check' : 'square'}
            size={layout.checkboxSize}
            color={block.checked ? colors.success : colors.inkMuted}
          />
        </Pressable>
      ) : block.type === 'toggle' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !block.collapsed }}
          accessibilityLabel={block.collapsed ? 'Expand toggle' : 'Collapse toggle'}
          onPress={onToggleCollapsed}
          hitSlop={10}
          style={styles.marker}
        >
          <Icon name={block.collapsed ? 'chev' : 'chev-down'} size={15} color={colors.inkMuted} />
        </Pressable>
      ) : (
        <Prefix type={block.type} ordinal={ordinal} />
      )}

      <View style={styles.body}>
        <CodeChrome enabled={block.type === 'code'} text={block.text} editing={editing}>
          {editing ? (
            <AutosaveField
              key={`seed-${editSeed}`}
              initialText={block.text}
              initialSelection={editSelection}
              onCommit={(t) => onCommitText(t)}
              onChange={onChange}
              onClose={onClose}
              onDeleteEmpty={onDeleteEmpty}
              onEnter={onEnter}
              onBackspaceAtStart={onBackspaceAtStart}
              onArrowBoundary={onArrowBoundary}
              onTab={onTab}
              onKeyDownCapture={onKeyDownCapture}
              autoFocus
              commitEmpty
              plain
              autoGrow
              newlineOnEnter={isMultiline(block.type)}
              textVariant={variantFor(block.type)}
              mono={monoFor(block.type)}
              multiline={isMultiline(block.type)}
              placeholder={placeholderFor(block.type)}
              containerStyle={styles.editPad}
              accessibilityLabel="Block text"
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={block.text ? 'Edit block' : 'Empty block'}
              onPress={onEdit}
              onLongPress={openHandle}
              style={[styles.read, { minHeight: typeScale[variantFor(block.type)].lineHeight + spacing.sm }]}
            >
              {/* Unfocused empty blocks render BLANK (min-height keeps the tap
                  target) — the placeholder belongs to the focused editor only. */}
              {block.text ? (
                <Txt
                  variant={variantFor(block.type)}
                  mono={monoFor(block.type)}
                  tone={block.checked ? 'inkMuted' : undefined}
                  style={block.checked ? styles.doneText : undefined}
                >
                  {block.text}
                </Txt>
              ) : null}
            </Pressable>
          )}
        </CodeChrome>
      </View>
      {commentTab}
    </View>
  );
}

/* ─────────────────────────── comment affordance ───────────────────────────── */

/**
 * Right-margin comment control for a block row (Notion's idiom). Persistent with a
 * count once a discussion exists; hover/edit-revealed otherwise. An accent dot marks
 * a discussion with unread comments from other members.
 */
function CommentTab({ count, unread, visible, onPress }: { count: number; unread: boolean; visible: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  if (count === 0 && !visible) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${count} comment${count === 1 ? '' : 's'}` : 'Add a comment'}
      onPress={onPress}
      hitSlop={6}
      style={styles.commentTab}
    >
      <Icon name="chat" size={14} color={count > 0 ? colors.inkMuted : colors.inkFaint} />
      {count > 0 ? <Txt variant="micro" mono tone="inkMuted">{count}</Txt> : null}
      {unread ? (
        <View style={[styles.commentDot, { backgroundColor: colors.accent }]} />
      ) : null}
    </Pressable>
  );
}

/* ─────────────────────────── code chrome ──────────────────────────────────── */

/**
 * The recessed panel around a code block — present in BOTH read and edit mode so
 * entering edit doesn't strip the chrome. Read mode scrolls long lines
 * horizontally and offers a copy control (hover-revealed on web; always visible,
 * faint, on touch — hover-only affordances must keep a touch path).
 */
function CodeChrome({ enabled, text, editing, children }: { enabled: boolean; text: string; editing: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useRowHover();
  const { copied, copy } = useCopy();
  if (!enabled) return <>{children}</>;
  const showCopy = !editing && !!text && (Platform.OS !== 'web' || hovered);
  return (
    <View {...hoverProps} style={[styles.codePanel, { backgroundColor: colors.codeBg, borderColor: colors.codeBorder }]}>
      {editing ? (
        children
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.codeScroll}>
          {children}
        </ScrollView>
      )}
      {showCopy ? (
        <View style={styles.codeCopy}>
          <IconButton
            name={copied ? 'check' : 'copy'}
            size={14}
            color={copied ? colors.success : colors.inkMuted}
            onPress={() => copy(text)}
            tooltip="Copy code"
            accessibilityLabel="Copy code"
          />
        </View>
      ) : null}
    </View>
  );
}

/* ─────────────────────────── gutter / prefix / page row ──────────────────── */

/**
 * Left-gutter hover controls for a block row: a "+" that inserts a new block
 * below (anchored type menu) and a grip opening the block handle menu
 * (duplicate / move / turn into / delete). Reserves
 * {@link layout.blockGutterWidth} so rows never shift; the cluster overflows
 * LEFT into the margin (Notion-style margin handles).
 */
function BlockGutter({
  visible,
  onAdd,
  onHandle,
}: {
  visible: boolean;
  onAdd: (anchor: RefObject<ViewType | null>) => void;
  onHandle: (anchor: RefObject<ViewType | null>) => void;
}) {
  const { colors } = useTheme();
  const addRef = useRef<ViewType | null>(null);
  const gripRef = useRef<ViewType | null>(null);
  return (
    <View style={styles.gutter}>
      {visible ? (
        <View style={styles.gutterCluster}>
          <View ref={addRef} collapsable={false}>
            <IconButton
              name="plus"
              size={layout.blockHandleSize}
              color={colors.inkMuted}
              onPress={() => onAdd(addRef)}
              tooltip="Add block below"
              accessibilityLabel="Insert block below"
              style={styles.gutterBtn}
            />
          </View>
          <View ref={gripRef} collapsable={false}>
            <IconButton
              name="grip"
              size={layout.blockHandleSize}
              color={colors.inkMuted}
              onPress={() => onHandle(gripRef)}
              tooltip="Block actions"
              accessibilityLabel="Block actions"
              style={styles.gutterBtn}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Leading list marker for bullet / numbered / quote blocks (todo and toggle
 *  render their own interactive markers in {@link BlockRow}). */
function Prefix({ type, ordinal }: { type: BlockType; ordinal?: number }) {
  const { colors } = useTheme();
  if (type === 'bulleted') return <Txt style={styles.marker} tone="inkMuted">•</Txt>;
  if (type === 'numbered') return <Txt style={styles.marker} tone="inkMuted" mono>{`${ordinal ?? 1}.`}</Txt>;
  if (type === 'quote') return <View style={[styles.quoteBar, { backgroundColor: colors.accent }]} />;
  // Paragraphs / headings carry no leading marker, so their text sits flush with the
  // hero title (which is inset by the same gutter) — no stray indent.
  return null;
}

/** A child-object link row — icon + LIVE title from the index store (renames
 *  propagate), hover-washed like a tree row; long-press opens the handle menu. */
function ObjectRefRow({ node, blockType, onPress, onLongPress }: { node?: ObjectNode; blockType: BlockType; onPress: () => void; onLongPress?: () => void }) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const gone = !node || node.archived;
  const fallbackLabel = blockType === 'image' ? 'Deleted image' : blockType === 'file' ? 'Deleted file' : 'Deleted page';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${node?.title || 'Untitled'}`}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={gone && !node}
      {...hoverProps}
      style={({ pressed }) => [
        styles.pageRow,
        { backgroundColor: pressed ? colors.pressed : hovered ? colors.hover : 'transparent' },
      ]}
    >
      {node?.emoji ? (
        <Txt variant="body">{node.emoji}</Txt>
      ) : (
        <Icon name={node ? iconForNode(node) : blockType === 'image' ? 'image' : blockType === 'file' ? 'file' : 'page'} size={16} color={colors.inkMuted} />
      )}
      <Txt variant="body" weight="medium" tone={gone ? 'inkFaint' : 'ink'} numberOfLines={1} style={styles.pageRowTitle}>
        {gone && !node ? fallbackLabel : node?.title || 'Untitled'}
      </Txt>
    </Pressable>
  );
}

/* ─────────────────────────── native accessory toolbar ─────────────────────── */

/**
 * The keyboard accessory pinned by the route while a block is edited on native:
 * the structural verbs hover/keys provide on desktop (insert below, turn into,
 * indent, move, done) — all ≥44px effective targets (IconButton's hitSlop).
 */
function PageEditToolbar({
  onInsertBelow,
  onTurnInto,
  onOutdent,
  onIndent,
  onMoveUp,
  onMoveDown,
  onDone,
}: {
  onInsertBelow: () => void;
  onTurnInto: () => void;
  onOutdent: () => void;
  onIndent: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.toolbar, { borderTopColor: colors.lineSoft, backgroundColor: colors.paper }]}>
      <IconButton name="plus" size={18} color={colors.inkSoft} onPress={onInsertBelow} accessibilityLabel="Insert block below" />
      <IconButton name="grip" size={18} color={colors.inkSoft} onPress={onTurnInto} accessibilityLabel="Block actions" />
      <IconButton name="arrow-l" size={18} color={colors.inkSoft} onPress={onOutdent} accessibilityLabel="Outdent" />
      <IconButton name="arrow-r" size={18} color={colors.inkSoft} onPress={onIndent} accessibilityLabel="Indent" />
      <IconButton name="arrow-up" size={18} color={colors.inkSoft} onPress={onMoveUp} accessibilityLabel="Move block up" />
      <IconButton name="arrow-down" size={18} color={colors.inkSoft} onPress={onMoveDown} accessibilityLabel="Move block down" />
      <View style={styles.toolbarSpacer} />
      <IconButton name="check" size={18} color={colors.accent} onPress={onDone} accessibilityLabel="Done editing" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: spacing.sm },
  blocks: { gap: layout.blockRowGap },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 1 },
  gutter: { width: layout.blockGutterWidth },
  // The handle cluster lives in the left margin, ending a touch BEFORE the text
  // column (right: 8) so the +/⠿ never crowd the marker or text — Notion-style
  // margin handles. It overflows left out of the reserved gutter.
  gutterCluster: { position: 'absolute', right: 8, top: 3, flexDirection: 'row', alignItems: 'center' },
  gutterBtn: { padding: 1 },
  // Left-aligned so the marker glyph (•, 1., checkbox, chevron) sits flush at the
  // text-column edge — aligned with the title and with paragraph text.
  marker: { width: 22, alignItems: 'flex-start', paddingTop: 3 },
  quoteBar: { width: layout.quoteBarWidth, alignSelf: 'stretch', borderRadius: radii.xs, marginRight: spacing.xs },
  body: { flex: 1, gap: spacing.xs },
  // Read and edit modes share the same vertical padding so the Txt ⇄ TextInput
  // swap never shifts the text (the old asymmetric paddings were a visible jump).
  read: { paddingVertical: spacing.xs, justifyContent: 'center' },
  editPad: { paddingVertical: spacing.xs },
  doneText: { textDecorationLine: 'line-through' },
  dividerHit: { flex: 1, paddingVertical: spacing.xs },
  rule: { height: 1, borderRadius: radii.xs },
  // Child-page link row — minHeight keeps a touch-friendly target on phones.
  pageRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    minHeight: Platform.OS === 'web' ? undefined : spacing.controlMinHeight - spacing.md,
  },
  pageRowTitle: { flexShrink: 1 },
  subPages: { marginTop: spacing.sm, paddingLeft: layout.blockGutterWidth },
  subPagesLabel: { marginBottom: spacing.xs },
  codePanel: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  codeScroll: { flexGrow: 1 },
  codeCopy: { position: 'absolute', top: spacing.xs, right: spacing.xs },
  tail: { minHeight: layout.docEditorMinHeight, paddingVertical: spacing.sm, paddingLeft: layout.blockGutterWidth },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: spacing.controlMinHeight,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
  },
  toolbarSpacer: { flex: 1 },
  // Right-margin comment control, vertically centered against the first text line.
  commentTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: 3,
    paddingLeft: spacing.xs,
  },
  commentDot: {
    width: layout.commentUnreadDot,
    height: layout.commentUnreadDot,
    borderRadius: layout.commentUnreadDot / 2,
  },
});
