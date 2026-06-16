import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SWATCH_NAMES, swatches, radii, spacing } from '@/theme';
import { relativeTime } from '@drakkar.software/octovault-sdk';
import { useCalendar, type CalendarEvent } from '@/lib/use-calendar';
import { useConfirm } from '@/lib/use-confirm';
import { useTheme } from '@/lib/use-theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Txt } from '@/components/ui/Txt';

interface CalendarViewProps {
  spaceId: string;
  objectId: string;
}

function formatEventDate(start: number, end: number, allDay: boolean): string {
  if (allDay) {
    return new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  const dateStr = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const startTime = startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) {
    const endTime = endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${dateStr} · ${startTime}–${endTime}`;
  }
  return dateStr;
}

interface EventRowProps {
  event: CalendarEvent;
  index: number;
  onDelete: () => void;
}

function EventRow({ event, index, onDelete }: EventRowProps) {
  const { colors, scheme } = useTheme();
  const confirm = useConfirm();
  const swatchKey = event.color && SWATCH_NAMES.includes(event.color as typeof SWATCH_NAMES[number])
    ? (event.color as typeof SWATCH_NAMES[number])
    : SWATCH_NAMES[index % SWATCH_NAMES.length];
  const dotColor = swatches[scheme][swatchKey].solid;

  return (
    <Pressable
      accessibilityRole="button"
      onLongPress={async () => {
        const ok = await confirm({ title: `Delete "${event.title || 'Event'}"?`, danger: true });
        if (ok) onDelete();
      }}
      style={({ pressed }) => [
        styles.eventRow,
        { backgroundColor: pressed ? colors.pressed : 'transparent' },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.eventText}>
        <Txt variant="callout" weight="semibold">
          {event.title || 'Untitled Event'}
        </Txt>
        <Txt variant="caption" tone="inkMuted">
          {formatEventDate(event.start, event.end, event.allDay)}
        </Txt>
        {event.desc ? (
          <Txt variant="caption" tone="inkSoft" numberOfLines={1}>
            {event.desc}
          </Txt>
        ) : null}
      </View>
      <Txt variant="caption" tone="inkFaint">
        {relativeTime(event.start)}
      </Txt>
    </Pressable>
  );
}

export function CalendarView({ spaceId, objectId }: CalendarViewProps) {
  const { colors } = useTheme();
  const calendar = useCalendar(spaceId, objectId);

  function addQuickEvent() {
    const now = Date.now();
    calendar.addEvent({
      start: now,
      end: now + 3600_000,
      title: 'New Event',
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      {/* Header */}
      <View style={styles.header}>
        <Txt variant="heading" weight="bold">Events</Txt>
        <IconButton
          name="plus"
          tooltip="Add event"
          accessibilityLabel="Add event"
          onPress={addQuickEvent}
        />
      </View>

      {/* Content */}
      {calendar.events.length === 0 ? (
        <EmptyState
          iconName="clock"
          title="No events yet"
          subtitle="Tap + to add an event."
        />
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {calendar.events.map((event, i) => (
            <EventRow
              key={event.id}
              event={event}
              index={i}
              onDelete={() => calendar.deleteEvent(event.id)}
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
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  dot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    marginTop: 4,
    flexShrink: 0,
  },
  eventText: { flex: 1, gap: 2 },
});
