import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { spacing } from '@/theme';
import { relativeTime } from '@drakkar.software/octovault-sdk';
import { useNotes, type NoteEntry, type NoteSort } from '@/lib/use-notes';
import { useSession } from '@/lib/session-context';
import { useSpaceObjects } from '@/lib/space-objects-context';
import { useTheme } from '@/lib/use-theme';
import { AppBar } from '@/components/ui/AppBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Pill } from '@/components/ui/Pill';
import { SignInPrompt } from '@/components/ui/SignInPrompt';
import { StackScreen } from '@/components/ui/StackScreen';
import { Txt } from '@/components/ui/Txt';

const SORT_LABELS: Record<NoteSort, string> = {
  updatedAt: 'Last updated',
  createdAt: 'Date created',
  title: 'Title',
};

interface NoteRowProps {
  note: NoteEntry;
  onPress: () => void;
  onDelete: () => void;
}

function NoteRow({ note, onPress, onDelete }: NoteRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={() => {
        Alert.alert(note.title || 'Note', undefined, [
          { text: 'Delete', style: 'destructive', onPress: onDelete },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }}
      style={({ pressed }) => [
        styles.noteRow,
        { borderBottomColor: colors.lineFaint },
        pressed && { backgroundColor: colors.pressed },
      ]}
    >
      <View style={styles.noteMain}>
        <Txt variant="callout" weight="semibold" numberOfLines={1}>
          {note.title || 'Untitled Note'}
        </Txt>
        <Txt variant="caption" tone="inkMuted">
          {relativeTime(note.updatedAt)}
        </Txt>
        {note.tags.length > 0 ? (
          <View style={styles.noteTags}>
            {note.tags.slice(0, 3).map((tag) => (
              <Pill key={tag} label={tag} tone="neutral" />
            ))}
            {note.tags.length > 3 ? (
              <Txt variant="micro" tone="inkFaint">
                +{note.tags.length - 3}
              </Txt>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Notes bottom tab — a personal "magic space" holding the user's own notes
 * within the active space, independent of the full vault tree. Lists objects of
 * type 'note', with tag filtering and sort controls.
 */
function NotesScreenContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const notes = useNotes();
  const { objects } = useSpaceObjects();

  function handleCreate() {
    const id = notes.createNote();
    if (id && notes.personalSpaceId) {
      router.push({ pathname: '/work/object/[id]', params: { id, spaceId: notes.personalSpaceId, focusTitle: '1' } });
    }
  }

  function handleSortPress() {
    const options: NoteSort[] = ['updatedAt', 'createdAt', 'title'];
    Alert.alert(
      'Sort by',
      undefined,
      [
        ...options.map((s) => ({
          text: SORT_LABELS[s] + (notes.sort === s ? ' ✓' : ''),
          onPress: () => notes.setSort(s),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }

  function openNote(note: NoteEntry) {
    if (!notes.personalSpaceId) return;
    router.push({ pathname: '/work/object/[id]', params: { id: note.id, spaceId: notes.personalSpaceId } });
  }

  function deleteNote(noteId: string) {
    objects.archive(noteId);
  }

  return (
    <StackScreen
      inTabs
      scroll={false}
      header={
        <AppBar
          title="My Notes"
          right={
            <View style={styles.headerRight}>
              <IconButton
                name="dots-v"
                onPress={handleSortPress}
                tooltip="Sort notes"
                accessibilityLabel="Sort notes"
              />
              <IconButton
                name="plus"
                onPress={handleCreate}
                tooltip="New note"
                accessibilityLabel="New note"
              />
            </View>
          }
        />
      }
    >
      <View style={[styles.inner, { backgroundColor: colors.paper }]}>
        {/* Tag filter row */}
        {notes.allTags.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tagScroll, { borderBottomColor: colors.lineFaint }]}
            contentContainerStyle={styles.tagScrollContent}
          >
            <Pill
              label="All"
              tone={notes.filterTag === null ? 'accent' : 'neutral'}
              onPress={() => notes.setFilterTag(null)}
            />
            {notes.allTags.map((tag) => (
              <Pill
                key={tag}
                label={tag}
                tone={notes.filterTag === tag ? 'accent' : 'neutral'}
                onPress={() => notes.setFilterTag(notes.filterTag === tag ? null : tag)}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* Notes list */}
        {notes.loading ? null : notes.notes.length === 0 ? (
          <EmptyState
            iconName="book"
            title="No notes yet"
            subtitle={
              notes.filterTag
                ? `No notes tagged "${notes.filterTag}".`
                : 'Your personal writing space — tap + to create your first note.'
            }
          />
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {notes.notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                onPress={() => openNote(note)}
                onDelete={() => deleteNote(note.id)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </StackScreen>
  );
}

export default function NotesScreen() {
  const { session } = useSession();

  if (!session) {
    return (
      <StackScreen
        inTabs
        scroll
        header={<AppBar title="My Notes" />}
        contentStyle={styles.content}
      >
        <SignInPrompt subtitle="Create an identity to access your personal notes." />
      </StackScreen>
    );
  }

  return <NotesScreenContent />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: 96 },
  inner: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tagScroll: { flexShrink: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  tagScrollContent: {
    paddingHorizontal: spacing.screenX,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 96 },
  noteRow: {
    paddingHorizontal: spacing.screenX,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  noteMain: { gap: 4 },
  noteTags: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', marginTop: 2 },
});
