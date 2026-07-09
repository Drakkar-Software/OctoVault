import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { spacing } from '@/theme';
import type { ID, ObjectTreeNode } from '@drakkar.software/octovault-sdk';
import { useNewNote, useNotes } from '@/lib/use-notes';
import { useOpenObjectId } from '@/lib/use-open-object-id';
import { Skeleton } from '@/components/ui/Skeleton';
import { Txt } from '@/components/ui/Txt';
import { ObjectTree } from '@/components/objects/ObjectTree';

import { CreateControl } from './WorkObjects';

const EMPTY_SET = new Set<ID>();
const noop = () => {};

/**
 * The sidebar panel for "My Notes" mode: the user's notes in the active space
 * (see {@link useNotes}), newest first, rendered as a flat {@link ObjectTree}
 * so rows share the workspace tree's hover/selection language. Read-and-open
 * only — note management (delete, tags) stays on the My Notes screen.
 */
export function WorkNotes() {
  const router = useRouter();
  const notes = useNotes();
  const { newNote, ready } = useNewNote();
  const openObjectId = useOpenObjectId();

  // Flat roots built by hand (NOT buildTree, which re-sorts by `order`) so the
  // sidebar keeps the hook's newest-first ordering.
  const roots = useMemo<ObjectTreeNode[]>(
    () => notes.notes.map((n) => ({ ...n, depth: 0, children: [] })),
    [notes.notes],
  );

  const openNote = (node: ObjectTreeNode) =>
    router.push({
      pathname: '/work/object/[id]',
      params: { id: node.id, spaceId: notes.personalSpaceId, label: node.title },
    });

  const list =
    roots.length > 0 ? (
      <ObjectTree
        nodes={roots}
        onOpen={openNote}
        collapsed={EMPTY_SET}
        onToggle={noop}
        selectedId={openObjectId ?? undefined}
      />
    ) : !notes.loading ? (
      <Txt variant="caption" tone="inkFaint" style={styles.empty}>
        No notes yet.
      </Txt>
    ) : (
      <View style={styles.skeletons}>
        <Skeleton height={12} width="74%" />
        <Skeleton height={12} width="58%" />
        <Skeleton height={12} width="66%" />
      </View>
    );

  return (
    <View style={styles.panel}>
      {list}
      <View style={styles.footer}>
        <CreateControl label="New note" iconName="plus" onPress={newNote} disabled={!ready} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 2 },
  empty: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  skeletons: { gap: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  footer: { marginTop: spacing.sm },
});
