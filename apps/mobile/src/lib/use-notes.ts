import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'expo-router';

import type { ObjectNode } from '@drakkar.software/octovault-sdk';
import { useSpaceObjects } from './space-objects-context';
import { useOpenObjectId } from './use-open-object-id';
import { useSpaces } from './use-spaces';

export type NoteSort = 'updatedAt' | 'title';

export interface NoteEntry extends ObjectNode {
  tags: string[];
}

export interface NotesHook {
  notes: NoteEntry[];
  allTags: string[];
  createNote: () => string | null;
  loading: boolean;
  filterTag: string | null;
  setFilterTag: (tag: string | null) => void;
  sort: NoteSort;
  setSort: (s: NoteSort) => void;
  /** The space being used for personal notes (the active space). */
  personalSpaceId: string;
}

function parseTags(meta: Record<string, unknown> | undefined): string[] {
  if (!meta) return [];
  const props = meta.props as Record<string, unknown> | undefined;
  if (!props) return [];
  const raw = props.tags;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

function compareNotes(a: NoteEntry, b: NoteEntry, sort: NoteSort): number {
  switch (sort) {
    case 'title':
      return a.title.localeCompare(b.title);
    case 'updatedAt':
    default:
      return b.updatedAt - a.updatedAt;
  }
}

/** Create a note in the active space and open it with the title focused —
 *  shared by the notes-mode sidebar header `+` and its "New note" footer row.
 *  Mirrors the My Notes screen's create flow (`useQuickCreate` shape). */
export function useNewNote(): { newNote: () => void; ready: boolean } {
  const router = useRouter();
  const { objects, spaceId } = useSpaceObjects();
  const { activeId } = useSpaces();
  const personalSpaceId = spaceId ?? activeId ?? '';
  const ready = objects.ready && !!personalSpaceId;

  const newNote = useCallback(() => {
    if (!ready) return;
    const id = objects.create({ type: 'note', title: 'Untitled Note' });
    if (id) {
      router.push({ pathname: '/work/object/[id]', params: { id, spaceId: personalSpaceId, focusTitle: '1' } });
    }
  }, [objects, personalSpaceId, ready, router]);

  return { newNote, ready };
}

/** True while the shell is in "My Notes" mode: the notes tab is open, or the
 *  object open in the editor is a note. */
export function useNotesMode(): boolean {
  const pathname = usePathname();
  const openObjectId = useOpenObjectId();
  const { objects } = useSpaceObjects();
  const openNode = openObjectId ? objects.get(openObjectId) : undefined;
  return pathname === '/notes' || openNode?.type === 'note';
}

export function useNotes(): NotesHook {
  const { objects, spaceId } = useSpaceObjects();
  const { activeId } = useSpaces();
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [sort, setSort] = useState<NoteSort>('updatedAt');

  const personalSpaceId = spaceId ?? activeId ?? '';

  const allNotes = useMemo<NoteEntry[]>(() => {
    return objects.nodes
      .filter((n) => n.type === 'note')
      .map((n) => ({ ...n, tags: parseTags(n.meta) }));
  }, [objects.nodes]);

  const allTags = useMemo<string[]>(() => {
    const tagSet = new Set<string>();
    for (const note of allNotes) {
      for (const tag of note.tags) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, [allNotes]);

  const notes = useMemo<NoteEntry[]>(() => {
    const filtered = filterTag ? allNotes.filter((n) => n.tags.includes(filterTag)) : allNotes;
    return [...filtered].sort((a, b) => compareNotes(a, b, sort));
  }, [allNotes, filterTag, sort]);

  const createNote = useCallback((): string | null => {
    if (!objects.ready || !personalSpaceId) return null;
    return objects.create({ type: 'note', title: 'Untitled Note' });
  }, [objects, personalSpaceId]);

  return {
    notes,
    allTags,
    createNote,
    loading: !objects.loaded,
    filterTag,
    setFilterTag,
    sort,
    setSort,
    personalSpaceId,
  };
}
