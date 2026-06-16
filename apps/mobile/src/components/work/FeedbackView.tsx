import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { radii, spacing } from '@/theme';
import { useFeedback, type FeedbackItem, type FeedbackStatus } from '@/lib/use-feedback';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/use-theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Pill, type PillTone } from '@/components/ui/Pill';
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

function FeedbackRow({ item, userId, onVote, onUnvote, onDelete, onStatusChange }: FeedbackRowProps) {
  const { colors } = useTheme();
  const hasVoted = !!userId && item.voters.includes(userId);
  const voteCount = item.voters.length;

  const handleVotePress = () => {
    if (!userId) return;
    if (hasVoted) onUnvote();
    else onVote();
  };

  const handleLongPress = () => {
    Alert.alert(item.title || 'Feedback', undefined, [
      {
        text: 'Change status…',
        onPress: () => {
          const statuses: FeedbackStatus[] = ['open', 'planned', 'in-progress', 'done'];
          Alert.alert('Set status', undefined, [
            ...statuses.map((s) => ({
              text: statusLabel(s),
              onPress: () => onStatusChange(s),
            })),
            { text: 'Cancel', style: 'cancel' as const },
          ]);
        },
      },
      { text: 'Delete', style: 'destructive' as const, onPress: onDelete },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <Pressable
      accessibilityRole="button"
      onLongPress={handleLongPress}
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
          pressed && { opacity: 0.7 },
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
              onVote={() => { if (userId) feedback.vote(item.id, userId, item.voters); }}
              onUnvote={() => { if (userId) feedback.unvote(item.id, userId, item.voters); }}
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
    minWidth: 36,
    height: 36,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    flexShrink: 0,
  },
  feedbackMain: { flex: 1, gap: 2 },
});
