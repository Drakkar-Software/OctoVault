import { useCallback, useMemo, useState } from 'react';

import type { ObjectNode } from '@drakkar.software/octovault-sdk';
import { useSpaceObjects } from './space-objects-context';
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
