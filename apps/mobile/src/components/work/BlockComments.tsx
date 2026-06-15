import { useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { layout, radii, spacing } from '@/theme';
import {
  fingerprintFromUserId,
  relativeTime,
  getQuickReactions,
  subscribeQuickReactions,
  type Comment,
  type CommentReaction,
  type DiscussionThread,
} from '@drakkar.software/octovault-sdk';
import { useResponsive } from '@/lib/use-responsive';
import { useTheme } from '@/lib/use-theme';
import { useAvatars, usePseudos } from '@/lib/use-pseudos';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { Txt } from '@/components/ui/Txt';

interface BlockCommentsProps {
  visible: boolean;
  onClose: () => void;
  /** The discussion for the open block (undefined → an empty, brand-new thread). */
  thread?: DiscussionThread;
  /** Viewer's account id — drives "Delete" on own comments and reaction highlighting. */
  currentUserId: string;
  onAdd: (text: string) => void;
  onEdit: (commentId: string, text: string) => void;
  onRemove: (commentId: string) => void;
  onResolve: (resolved: boolean) => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
}

/** Resolve a display label for an author: their pseudo, else a short fingerprint. */
function useAuthorDisplay(comments: Comment[]) {
  const ids = useMemo(() => {
    const set = new Set<string>();
    for (const c of comments) {
      set.add(c.author);
      for (const r of c.reactions) for (const u of r.userIds) set.add(u);
    }
    return [...set];
  }, [comments]);
  const pseudo = usePseudos(ids);
  const avatar = useAvatars(ids);
  return {
    name: (id: string) => pseudo(id) ?? fingerprintFromUserId(id),
    avatar: (id: string) => avatar(id),
    monogram: (id: string) => id.slice(0, 2).toUpperCase(),
  };
}

/**
 * The floating discussion for one block — a docked side panel on wide screens and
 * a bottom sheet on phones (the {@link Sheet} `panel`/`sheet` idiom, like
 * {@link TaskDetailSheet}). Lists the block's comments with author + relative time,
 * emoji reactions (the per-identity quick-reaction palette), a resolve toggle, and
 * a composer pinned to the footer. Pure presentation — every mutation is delegated
 * to the `usePageComments` callbacks the page wires in.
 */
export function BlockComments({
  visible, onClose, thread, currentUserId,
  onAdd, onEdit, onRemove, onResolve, onToggleReaction,
}: BlockCommentsProps) {
  const { colors } = useTheme();
  const { isWide } = useResponsive();
  const [draft, setDraft] = useState('');

  const comments = thread?.comments ?? [];
  const display = useAuthorDisplay(comments);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft('');
  };

  const composer = (
    <View style={styles.composer}>
      <View style={styles.composerField}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment…"
          accessibilityLabel="Add a comment"
          onSubmitEditing={send}
          returnKeyType="send"
          blurOnSubmit={false}
        />
      </View>
      <IconButton
        name="send"
        size={18}
        color={draft.trim() ? colors.accent : colors.inkFaint}
        onPress={send}
        accessibilityLabel="Post comment"
        tooltip="Post"
      />
    </View>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      presentation={isWide ? 'panel' : 'sheet'}
      width={layout.peekPaneWidth}
      title="Comments"
      footer={composer}
    >
      {thread?.resolved ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reopen discussion"
          onPress={() => onResolve(false)}
          style={[styles.resolvedBanner, { backgroundColor: colors.fill }]}
        >
          <Icon name="check-circle" size={14} color={colors.success} />
          <Txt variant="footnote" tone="inkMuted" style={styles.resolvedText}>Resolved — tap to reopen</Txt>
        </Pressable>
      ) : comments.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resolve discussion"
          onPress={() => onResolve(true)}
          style={styles.resolveRow}
        >
          <Icon name="check" size={13} color={colors.inkMuted} />
          <Txt variant="footnote" tone="inkMuted">Mark resolved</Txt>
        </Pressable>
      ) : null}

      {comments.length === 0 ? (
        <Txt variant="callout" tone="inkFaint" center style={styles.empty}>
          No comments yet. Start the discussion.
        </Txt>
      ) : (
        comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            mine={c.author === currentUserId}
            currentUserId={currentUserId}
            display={display}
            onEdit={(text) => onEdit(c.id, text)}
            onRemove={() => onRemove(c.id)}
            onToggleReaction={(emoji) => onToggleReaction(c.id, emoji)}
          />
        ))
      )}
    </Sheet>
  );
}

interface CommentItemProps {
  comment: Comment;
  mine: boolean;
  currentUserId: string;
  display: ReturnType<typeof useAuthorDisplay>;
  onEdit: (text: string) => void;
  onRemove: () => void;
  onToggleReaction: (emoji: string) => void;
}

function CommentItem({ comment, mine, currentUserId, display, onEdit, onRemove, onToggleReaction }: CommentItemProps) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [picking, setPicking] = useState(false);

  const commit = () => {
    const text = draft.trim();
    if (text && text !== comment.body) onEdit(text);
    setEditing(false);
  };

  return (
    <View style={styles.item}>
      <Avatar label={display.monogram(comment.author)} image={display.avatar(comment.author)} size={layout.commentAvatarSize} />
      <View style={styles.itemBody}>
        <View style={styles.itemHead}>
          <Txt variant="footnote" weight="semibold" numberOfLines={1} style={styles.author}>
            {display.name(comment.author)}
          </Txt>
          <Txt variant="micro" mono tone="inkFaint">{relativeTime(comment.createdAt)}</Txt>
          <View style={styles.headSpacer} />
          {mine && !editing ? (
            <>
              <IconButton name="edit" size={13} color={colors.inkFaint} onPress={() => { setDraft(comment.body); setEditing(true); }} accessibilityLabel="Edit comment" />
              <IconButton name="trash" size={13} color={colors.inkFaint} onPress={onRemove} accessibilityLabel="Delete comment" />
            </>
          ) : null}
        </View>

        {editing ? (
          <View style={styles.editRow}>
            <View style={styles.composerField}>
              <TextField value={draft} onChangeText={setDraft} accessibilityLabel="Edit comment" onSubmitEditing={commit} autoFocus blurOnSubmit={false} />
            </View>
            <IconButton name="check" size={16} color={colors.accent} onPress={commit} accessibilityLabel="Save edit" />
            <IconButton name="x" size={16} color={colors.inkFaint} onPress={() => setEditing(false)} accessibilityLabel="Cancel edit" />
          </View>
        ) : (
          <Txt variant="body" tone="ink">{comment.body}</Txt>
        )}

        <ReactionBar
          reactions={comment.reactions}
          currentUserId={currentUserId}
          picking={picking}
          onTogglePicker={() => setPicking((p) => !p)}
          onToggle={(emoji) => { onToggleReaction(emoji); setPicking(false); }}
        />
      </View>
    </View>
  );
}

interface ReactionBarProps {
  reactions: CommentReaction[];
  currentUserId: string;
  picking: boolean;
  onTogglePicker: () => void;
  onToggle: (emoji: string) => void;
}

/** Existing reaction pills (tap to toggle yours) plus a smile button that reveals
 *  the viewer's quick-reaction palette inline — no nested modal inside the Sheet. */
function ReactionBar({ reactions, currentUserId, picking, onTogglePicker, onToggle }: ReactionBarProps) {
  const { colors } = useTheme();
  const palette = useSyncExternalStore(subscribeQuickReactions, getQuickReactions, getQuickReactions);

  return (
    <View style={styles.reactions}>
      {reactions.map((r) => {
        const mine = r.userIds.includes(currentUserId);
        return (
          <Pressable
            key={r.emoji}
            accessibilityRole="button"
            accessibilityLabel={`${r.emoji} ${r.userIds.length}`}
            onPress={() => onToggle(r.emoji)}
            style={[styles.pill, { backgroundColor: mine ? colors.accentSoft : colors.fill, borderColor: mine ? colors.accent : 'transparent' }]}
          >
            <Txt variant="footnote">{r.emoji}</Txt>
            <Txt variant="micro" mono tone={mine ? 'accent' : 'inkMuted'}>{r.userIds.length}</Txt>
          </Pressable>
        );
      })}
      <IconButton name="smile" size={15} color={colors.inkFaint} onPress={onTogglePicker} accessibilityLabel="Add reaction" />
      {picking ? (
        <View style={[styles.palette, { backgroundColor: colors.fill, borderColor: colors.lineSoft }]}>
          {palette.map((emoji) => (
            <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`React ${emoji}`} onPress={() => onToggle(emoji)} style={styles.paletteCell}>
              <Txt variant="callout">{emoji}</Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  resolvedBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radii.md },
  resolvedText: { flex: 1 },
  resolveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  empty: { paddingVertical: spacing.xl },
  item: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  itemBody: { flex: 1, gap: spacing.xs },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  author: { flexShrink: 1 },
  headSpacer: { flex: 1 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reactions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  palette: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  paletteCell: { paddingHorizontal: spacing.xs },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  composerField: { flex: 1 },
});
