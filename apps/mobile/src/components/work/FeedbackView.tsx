import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { layout, opacity, radii, spacing } from '@/theme';
import { useFeedback, type FeedbackItem, type FeedbackStatus } from '@/lib/use-feedback';
import { useConfirm } from '@/lib/use-confirm';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/use-theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';

interface FeedbackViewProps {
  spaceId: string;
  objectId: string;
}

function statusTone(status: FeedbackStatus): PillTone {
  switch (status) {
    case 'planned':     return 'accent';
    case 'in-progress': return 'note';
    case 'done':        return 'success';
    case 'open':
    default:            return 'neutral';
  }
}

function statusLabel(status: FeedbackStatus): string {
  switch (status) {
    case 'in-progress': return 'In progress';
    case 'planned':     return 'Planned';
    case 'done':        return 'Done';
    case 'open':
    default:            return 'Open';
  }
}

interface FeedbackRowProps {
  item: FeedbackItem;
  userId: string | null;
  onVote: () => void;
  onUnvote: () => void;
  onDelete: () => void;
  onStatusChange: (status: FeedbackStatus) => void;
}

const FEEDBACK_STATUSES: FeedbackStatus[] = ['open', 'planned', 'in-progress', 'done'];

function FeedbackRow({ item, userId, onVote, onUnvote, onDelete, onStatusChange }: FeedbackRowProps) {
  const { colors } = useTheme();
  const confirm = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasVoted = !!userId && item.voters.includes(userId);
  const voteCount = item.voters.length;

  const handleVotePress = () => {
    if (!userId) return;
    if (hasVoted) onUnvote();
    else onVote();
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: `Delete "${item.title || 'Feedback'}"?`,
      message: 'This item and its votes will be removed.',
      danger: true,
    });
    if (ok) onDelete();
  };

  return (
    <Pressable
      accessibilityRole="button"
      onLongPress={() => setMenuOpen(true)}
      style={({ pressed }) => [
        styles.feedbackRow,
        { borderBottomColor: colors.lineFaint },
        pressed && { backgroundColor: colors.pressed },
      ]}
    >
      {/* Vote button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasVoted ? 'Unvote' : 'Vote'}
        hitSlop={8}
        onPress={handleVotePress}
        style={({ pressed }) => [
          styles.voteBtn,
          {
            backgroundColor: hasVoted ? colors.accentBg : colors.fill,
            borderColor: hasVoted ? colors.accentBorder : colors.lineSoft,
          },
          pressed && { opacity: opacity.muted },
        ]}
      >
        <Txt variant="micro" weight="bold" color={hasVoted ? colors.accent : colors.inkSoft}>
          {voteCount}
        </Txt>
      </Pressable>

      {/* Title */}
      <View style={styles.feedbackMain}>
        <Txt variant="callout" weight="semibold">
          {item.title || 'Untitled'}
        </Txt>
        {item.desc ? (
          <Txt variant="caption" tone="inkMuted" numberOfLines={2}>
            {item.desc}
          </Txt>
        ) : null}
      </View>

      {/* Status */}
      <Pill
        label={statusLabel(item.status)}
        tone={statusTone(item.status)}
      />

      {/* Context menu: long-press opens a Sheet (no fixed anchor on long-press) with
          status options and a danger delete that requires a confirm. */}
      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={item.title || 'Feedback'}>
        <Menu>
          {FEEDBACK_STATUSES.map((s) => (
            <MenuItem
              key={s}
              label={statusLabel(s)}
              checked={item.status === s}
              onPress={() => { setMenuOpen(false); onStatusChange(s); }}
            />
          ))}
          <MenuSeparator />
          <MenuItem label="Delete" danger onPress={handleDelete} />
        </Menu>
      </Sheet>
    </Pressable>
  );
}

export function FeedbackView({ spaceId, objectId }: FeedbackViewProps) {
  const { colors } = useTheme();
  const { session } = useSession();
  const userId = session?.userId ?? null;
  const feedback = useFeedback(spaceId, objectId);

  function addItem() {
    feedback.addItem('New feedback item');
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      {/* Header */}
      <View style={styles.header}>
        <Txt variant="heading" weight="bold">Feedback</Txt>
        <IconButton
          name="plus"
          tooltip="Add feedback"
          accessibilityLabel="Add feedback"
          onPress={addItem}
        />
      </View>

      {/* Content */}
      {feedback.items.length === 0 ? (
        <EmptyState
          iconName="check"
          title="No feedback yet"
          subtitle="Tap + to add a feedback item."
        />
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {feedback.items.map((item) => (
            <FeedbackRow
              key={item.id}
              item={item}
              userId={userId}
              onVote={() => { if (userId) feedback.vote(item.id, userId); }}
              onUnvote={() => { if (userId) feedback.unvote(item.id, userId); }}
              onDelete={() => feedback.deleteItem(item.id)}
              onStatusChange={(status) => feedback.patchItem(item.id, { status })}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.xxxl },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  voteBtn: {
    minWidth: layout.voteControlSize,
    height: layout.voteControlSize,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    flexShrink: 0,
  },
  feedbackMain: { flex: 1, gap: 2 },
});
