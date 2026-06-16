/**
 * Quick Find brain — everything behind the mod+K command palette AND the mobile
 * Search tab, so the two surfaces stay one feature with two shells. Owns:
 *
 *  - the palette's OPEN state, as a module-level store so any chrome (the
 *    sidebar search icon, the global shortcut) can open it without threading
 *    props through the shell;
 *  - query → ranked results over the ACTIVE space's pages/boards (titles via
 *    {@link rankResults}; the shared {@link useSpaceObjects} index store, never
 *    a second one);
 *  - the empty-query Recents view (resolved live against the index so renames/
 *    archives reflect) and the command rows (new page/board, switch space,
 *    create-from-query escape hatch);
 *  - keyboard selection (wrap-around arrows + Enter) shared by both shells.
 *
 * Components stay dumb: each item arrives render-ready (highlight ranges,
 * breadcrumb path, relative-time caption) and `activate()` performs the
 * navigation/creation itself.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { router } from 'expo-router';

import type { IconName } from '@/components/ui/Icon';

import { useTypeRegistry } from './type-registry-context';
import { useBrand } from './brand-context';
import { rankResults, type MatchRange } from '@drakkar.software/octovault-sdk';
import { relativeTimeShort } from '@drakkar.software/octovault-sdk';
import { recordVisit, useRecents } from './use-recents';
import { useSpaceObjects } from './space-objects-context';
import { useSpaces } from './use-spaces';
import { formatShortcut } from './use-shortcuts';
import type { ObjectNode } from '@drakkar.software/octovault-sdk';

/** Scope the palette pushes while open — silences the shell's global bindings. */
export const QUICK_FIND_SCOPE = 'quick-find';

// ── Palette open state (module store — openable from any chrome) ───────────

let openSnapshot = false;
const openListeners = new Set<() => void>();

function setOpen(next: boolean): void {
  if (openSnapshot === next) return;
  openSnapshot = next;
  for (const l of openListeners) l();
}

export function openQuickFind(): void {
  setOpen(true);
}
export function closeQuickFind(): void {
  setOpen(false);
}
export function toggleQuickFind(): void {
  setOpen(!openSnapshot);
}

const subscribeOpen = (l: () => void) => {
  openListeners.add(l);
  return () => {
    openListeners.delete(l);
  };
};
const getOpen = () => openSnapshot;

/** Whether the command palette overlay is up (drives {@link CommandPalette}). */
export function useQuickFindVisible(): boolean {
  return useSyncExternalStore(subscribeOpen, getOpen, getOpen);
}

// ── The hook ────────────────────────────────────────────────────────────────

export type QuickFindItem =
  | {
      kind: 'node';
      key: string;
      /** Section label inserted above the first item of a group (undefined = none). */
      section?: string;
      node: ObjectNode;
      ranges: MatchRange[];
      /** Root→parent breadcrumb caption, e.g. "Projects / Q1". */
      path: string;
      /** Relative-time caption from `updatedAt`/visit ts. */
      when: string;
    }
  | {
      kind: 'action';
      key: string;
      section?: string;
      icon: IconName;
      label: string;
      /** Trailing mono hint (a shortcut or "↵"). */
      hint?: string;
      run: () => void;
    };

export interface QuickFind {
  query: string;
  setQuery: (q: string) => void;
  /** Flat, selectable rows (sections ride on the items as labels). */
  items: QuickFindItem[];
  /** Query is non-empty but matched no page/board (drives the no-match notice). */
  noMatches: boolean;
  /** Active space's name, for scope captions/placeholders. Null when signed out. */
  spaceName: string | null;
  selected: number;
  setSelected: (i: number) => void;
  /** Move keyboard selection, wrapping at both ends. */
  move: (delta: number) => void;
  /** Open/run the selected (or given) row. */
  activate: (index?: number) => void;
}

/** How many recents the empty-query view shows (the kv store keeps more). */
const RECENTS_SHOWN = 8;

export function useQuickFind(opts: { limit?: number; onNavigate?: () => void } = {}): QuickFind {
  const limit = opts.limit ?? 50;
  // Ref'd so a caller's inline closure doesn't invalidate the items memo.
  const onNavigateRef = useRef(opts.onNavigate);
  onNavigateRef.current = opts.onNavigate;

  const registry = useTypeRegistry();
  const { has } = useBrand();
  const { spaceId, objects } = useSpaceObjects();
  const { spaces, activeId, switchSpace } = useSpaces();
  const { recents } = useRecents();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const space = spaces.find((s) => s.id === activeId) ?? null;
  const q = query.trim();

  const items = useMemo<QuickFindItem[]>(() => {
    const navigate = () => onNavigateRef.current?.();

    const createObject = (type: string, title: string) => {
      if (!spaceId) return;
      const id = objects.create({ type, title, parentId: null });
      if (!id) return;
      recordVisit(spaceId, id);
      navigate();
      // A blank title hands focus to the hero title editor (the create-flow
      // convention); a query-seeded title lands ready to write.
      router.push({
        pathname: '/work/object/[id]',
        params: { id, spaceId, label: title, ...(title ? {} : { focusTitle: '1' }) },
      });
    };

    const switchTo = (id: string) => {
      navigate();
      // The context's switchSpace, NOT a bare setActiveId: it lands the main
      // pane home first AND arms the intent veto, so an exiting doc route's
      // space re-sync can't silently revert the user's explicit choice.
      switchSpace(id);
    };

    const nodeItem = (n: ObjectNode, ranges: MatchRange[], section?: string, ts?: number): QuickFindItem => ({
      kind: 'node',
      key: `node:${n.id}`,
      section,
      node: n,
      ranges,
      path: objects
        .ancestors(n.id)
        .map((a) => a.title || 'Untitled')
        .join(' / '),
      when: relativeTimeShort(ts ?? n.updatedAt),
    });

    const searchable = objects.nodes.filter((n) => registry.isFindableType(n.type));
    const out: QuickFindItem[] = [];

    if (!q) {
      // Empty query — Recents resolved against the live index (a rename shows
      // the new title; an archived/foreign entry silently drops out).
      const byId = new Map(searchable.map((n) => [n.id, n]));
      let shown = 0;
      for (const r of recents) {
        if (r.spaceId !== spaceId) continue;
        const n = byId.get(r.objectId);
        if (!n) continue;
        out.push(nodeItem(n, [], 'Recent', r.ts));
        if (++shown >= RECENTS_SHOWN) break;
      }
      // No active space (zero-space identity) → no inert create rows; the
      // Vault's first-run CTA owns that moment.
      if (spaceId) {
        const workTreeCreatable = registry.creatableTypes().filter((d) => d.workTree && d.findable && d.editor !== 'file' && (!d.capability || has(d.capability)));
        workTreeCreatable.forEach((d, i) => {
          out.push({
            kind: 'action',
            key: `action:new-${d.type}`,
            section: i === 0 ? 'Actions' : undefined,
            icon: d.icon,
            label: `New ${d.label.toLowerCase()}`,
            hint: i === 0 ? (formatShortcut('mod+n') || undefined) : undefined,
            run: () => createObject(d.type, ''),
          });
        });
      }
      return out;
    }

    for (const { item, ranges } of rankResults(q, searchable, limit)) out.push(nodeItem(item, ranges));

    // Other spaces whose NAME matches — quick-switch without leaving the keyboard.
    for (const s of spaces) {
      if (s.id === activeId) continue;
      if (!rankResults(q, [{ title: s.name, updatedAt: 0 }], 1).length) continue;
      out.push({
        kind: 'action',
        key: `space:${s.id}`,
        section: out.some((i) => i.kind === 'action' && i.key.startsWith('space:')) ? undefined : 'Spaces',
        icon: 'arrow-r',
        label: `Switch to ${s.name}`,
        run: () => switchTo(s.id),
      });
    }

    // The escape hatch: never strand a search — the query seeds the title of the
    // first capable type (pages when available, otherwise the first capable type).
    if (spaceId && has('pages')) {
      out.push({
        kind: 'action',
        key: 'action:create-from-query',
        section: 'Actions',
        icon: 'plus',
        label: `New page “${q}”`,
        run: () => createObject('page', q),
      });
    }
    return out;
  }, [q, spaceId, objects, recents, spaces, activeId, switchSpace, limit, registry, has]);

  const noMatches = !!q && !items.some((i) => i.kind === 'node');

  // New query → selection snaps back to the best hit.
  useEffect(() => {
    setSelected(0);
  }, [q]);

  // A live index pull can shrink the list mid-flight — keep the selection on a
  // real row so Enter always has a target.
  useEffect(() => {
    setSelected((cur) => Math.max(0, Math.min(cur, items.length - 1)));
  }, [items.length]);

  const move = (delta: number) => {
    if (!items.length) return;
    setSelected((cur) => (((cur + delta) % items.length) + items.length) % items.length);
  };

  const activate = (index?: number) => {
    const item = items[Math.min(Math.max(index ?? selected, 0), items.length - 1)];
    if (!item) return;
    if (item.kind === 'action') item.run();
    else if (item.kind === 'node' && spaceId) {
      recordVisit(spaceId, item.node.id);
      onNavigateRef.current?.();
      router.push({
        pathname: '/work/object/[id]',
        params: { id: item.node.id, spaceId, emoji: item.node.emoji ?? '', label: item.node.title },
      });
    }
  };

  return { query, setQuery, items, noMatches, spaceName: space?.name ?? null, selected, setSelected, move, activate };
}

/**
 * Arrow (and optionally Escape-to-clear) wiring for the find input, shared by
 * the palette and the Search tab. RNW forwards every key through `onKeyPress`,
 * so one handler covers web arrows; `preventDefault` (web-only on the synthetic
 * event) stops them from also moving the caret. Enter activates through
 * `onSubmitEditing` ONLY — RNW fires it for Enter too, so handling Enter in
 * `onKeyPress` as well would double-activate (two identical route pushes).
 */
export function quickFindKeyHandlers(find: QuickFind, opts: { escapeClears?: boolean } = {}) {
  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = e.nativeEvent.key;
    const prevent = () => (e as unknown as { preventDefault?: () => void }).preventDefault?.();
    if (key === 'ArrowDown') {
      prevent();
      find.move(1);
    } else if (key === 'ArrowUp') {
      prevent();
      find.move(-1);
    } else if (key === 'Escape' && opts.escapeClears && find.query) {
      prevent();
      find.setQuery('');
    }
  };
  return { onKeyPress, onSubmitEditing: () => find.activate() };
}
