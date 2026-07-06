/**
 * CalendarView — editorial "almanac/ledger" calendar for OctoVault.
 *
 * Two views toggled via Segmented:
 *   Month — the signature view: hairline-ruled grid, Newsreader serif
 *           numerals, today's inked indigo disc, swatch event chips.
 *   Agenda — a time-sorted list of all events with tap-to-edit.
 *
 * Built on the `MonthGrid` headless component from `@drakkar.software/dk-spaces-ui`
 * (pure month math + theme-driven layout) wired to `useCalendar` (WAL-backed
 * CRDT events). `DateTimeField` replaces the previous raw-text date inputs.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MonthGrid, bucketEventsByDay, matrixDayKey } from '@drakkar.software/dk-spaces-ui';
import type { MatrixDay } from '@drakkar.software/dk-spaces-ui';

import { SWATCH_NAMES, radii, spacing, swatches } from '@/theme';
import type { SwatchName } from '@/theme';
import { relativeTime } from '@drakkar.software/octovault-sdk';
import { useCalendar, type CalendarEvent } from '@/lib/use-calendar';
import { useConfirm } from '@/lib/use-confirm';
import { useTheme } from '@/lib/use-theme';
import { AutosaveField } from '@/components/ui/AutosaveField';
import { Button } from '@/components/ui/Button';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { Txt } from '@/components/ui/Txt';

interface CalendarViewProps {
  spaceId: string;
  objectId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

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

// ── Color picker ──────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  const { colors, scheme } = useTheme();
  return (
    <View style={styles.colorRow}>
      {/* "no color" option */}
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel="No color"
        onPress={() => onChange(null)}
        style={[
          styles.colorDot,
          { backgroundColor: colors.fill, borderWidth: value === null ? 2 : 1,
            borderColor: value === null ? colors.accent : colors.lineSoft },
        ]}
      />
      {SWATCH_NAMES.map((name) => {
        const solid = swatches[scheme][name].solid;
        const selected = value === name;
        return (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityLabel={name}
            onPress={() => onChange(name)}
            style={[
              styles.colorDot,
              { backgroundColor: solid, borderWidth: selected ? 2 : 0,
                borderColor: selected ? colors.accent : 'transparent' },
            ]}
          />
        );
      })}
    </View>
  );
}

// ── Event chip (shown inside the MonthGrid day cells) ─────────────────────────

function EventChip({ event }: { event: CalendarEvent }) {
  const { scheme } = useTheme();
  const swatchKey: SwatchName = event.color && SWATCH_NAMES.includes(event.color as SwatchName)
    ? (event.color as SwatchName)
    : 'gray';
  const sw = swatches[scheme][swatchKey];
  return (
    <View style={[styles.eventChip, { backgroundColor: sw.bg }]}>
      <View style={[styles.eventChipDot, { backgroundColor: sw.solid }]} />
      <Txt variant="micro" style={[styles.eventChipLabel, { color: sw.text }]} numberOfLines={1}>
        {event.title || '·'}
      </Txt>
    </View>
  );
}

// ── Event edit sheet ──────────────────────────────────────────────────────────

interface EventEditSheetProps {
  visible: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Omit<CalendarEvent, 'id'>>) => void;
  onDelete: (id: string) => void;
}

function EventEditSheet({ visible, event, onClose, onPatch, onDelete }: EventEditSheetProps) {
  const confirm = useConfirm();

  if (!event) return null;

  const swatchColor = event.color && SWATCH_NAMES.includes(event.color as SwatchName)
    ? (event.color as SwatchName) : null;

  async function handleDelete() {
    const ok = await confirm({ title: `Delete "${event!.title || 'Event'}"?`, danger: true });
    if (ok) { onClose(); onDelete(event!.id); }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Edit Event">
      <View style={styles.editRoot}>
        {/* Title */}
        <AutosaveField
          initialText={event.title}
          textVariant="heading"
          plain
          placeholder="Event title"
          onCommit={(text) => onPatch(event.id, { title: text })}
        />

        {/* Description */}
        <AutosaveField
          initialText={event.desc ?? ''}
          multiline
          plain
          placeholder="Add description…"
          onCommit={(text) => onPatch(event.id, { desc: text || null })}
        />

        {/* Color */}
        <View style={styles.editSection}>
          <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint">Color</Txt>
          <ColorPicker
            value={swatchColor}
            onChange={(c) => onPatch(event.id, { color: c })}
          />
        </View>

        {/* All-day + date pickers */}
        <View style={styles.editSection}>
          <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint">Time</Txt>
          <ToggleRow
            title="All day"
            value={event.allDay}
            onValueChange={(v) => onPatch(event.id, { allDay: v })}
          />
          <DateTimeField
            label="Start"
            value={event.start}
            allDay={event.allDay}
            onChange={(ms) => onPatch(event.id, { start: ms, end: Math.max(ms, event.end) })}
          />
          <DateTimeField
            label="End"
            value={event.end}
            allDay={event.allDay}
            onChange={(ms) => onPatch(event.id, { end: Math.max(ms, event.start) })}
          />
        </View>

        {/* Delete */}
        <Button
          label="Delete Event"
          variant="danger"
          full
          iconName="trash"
          onPress={handleDelete}
        />
      </View>
    </Sheet>
  );
}

// ── Agenda event row ──────────────────────────────────────────────────────────

function EventRow({
  event,
  index,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors, scheme } = useTheme();
  const confirm = useConfirm();
  const swatchKey: SwatchName = event.color && SWATCH_NAMES.includes(event.color as SwatchName)
    ? (event.color as SwatchName)
    : SWATCH_NAMES[index % SWATCH_NAMES.length];
  const dotColor = swatches[scheme][swatchKey].solid;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={event.title || 'Event'}
      onPress={onEdit}
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

// ── CalendarView ──────────────────────────────────────────────────────────────

export function CalendarView({ spaceId, objectId }: CalendarViewProps) {
  const { colors } = useTheme();
  const calendar = useCalendar(spaceId, objectId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');

  // Month navigation
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const editingEvent = editingId
    ? calendar.events.find((e) => e.id === editingId) ?? null
    : null;

  // Pre-bucket events for the MonthGrid render-prop
  const eventBucket = useMemo(() => bucketEventsByDay(calendar.events), [calendar.events]);

  function addEventOnDay(day: MatrixDay) {
    // Noon on the tapped day
    const start = new Date(day.year, day.month, day.day, 12, 0, 0).getTime();
    const id = calendar.addEvent({ start, end: start + 3600_000, title: '' });
    if (id) setEditingId(id);
  }

  function addQuickEvent() {
    const now = Date.now();
    const id = calendar.addEvent({ start: now, end: now + 3600_000, title: '' });
    if (id) setEditingId(id);
  }

  function stepMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.editorCanvas }]}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: colors.lineFaint }]}>
        {viewMode === 'month' ? (
          <>
            {/* Month nav: ‹ Month Year › */}
            <View style={styles.monthNav}>
              <IconButton
                name="arrow-l"
                size={18}
                accessibilityLabel="Previous month"
                onPress={() => stepMonth(-1)}
              />
              <Txt variant="subhead" weight="semibold" style={styles.monthLabel}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Txt>
              <IconButton
                name="chev-right"
                size={18}
                accessibilityLabel="Next month"
                onPress={() => stepMonth(1)}
              />
            </View>
          </>
        ) : (
          <Txt variant="heading" weight="bold">Agenda</Txt>
        )}

        <View style={styles.headerRight}>
          <Segmented
            options={[
              { label: 'Month', value: 'month' },
              { label: 'Agenda', value: 'agenda' },
            ]}
            value={viewMode}
            onChange={(v) => setViewMode(v as 'month' | 'agenda')}
          />
          <IconButton
            name="plus"
            tooltip="Add event"
            accessibilityLabel="Add event"
            onPress={addQuickEvent}
          />
        </View>
      </View>

      {/* ── Body ────────────────────────────────────────────────────── */}
      {viewMode === 'month' ? (
        /* ── Month grid ── */
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.monthContent,
            { paddingHorizontal: spacing.screenX, paddingBottom: spacing.xxxl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {calendar.opening ? (
            /* Loading skeleton mirrors the grid shape */
            <Skeleton width="100%" height={320} radius={radii.md} />
          ) : (
            <MonthGrid
              year={viewYear}
              month={viewMonth}
              weekStart={1}
              todayTimestamp={Date.now()}
              onDayPress={(day) => {
                if (!day.inMonth) return;
                const key = matrixDayKey(day);
                const dayEvents = eventBucket.get(key) ?? [];
                if (dayEvents.length === 1) {
                  // Tap single event → edit it
                  setEditingId(dayEvents[0].id);
                } else {
                  // Empty day or multi-event → add new event on this day
                  addEventOnDay(day);
                }
              }}
              renderDayEvents={(day) => {
                if (!day.inMonth) return null;
                const key = matrixDayKey(day);
                const dayEvents = eventBucket.get(key);
                if (!dayEvents || dayEvents.length === 0) return null;
                return (
                  <>
                    {dayEvents.slice(0, 2).map((e) => (
                      <EventChip key={e.id} event={e} />
                    ))}
                    {dayEvents.length > 2 && (
                      <Txt variant="micro" tone="inkFaint" style={styles.moreLabel}>
                        +{dayEvents.length - 2} more
                      </Txt>
                    )}
                  </>
                );
              }}
            />
          )}
        </ScrollView>
      ) : (
        /* ── Agenda list ── */
        calendar.events.length === 0 ? (
          <EmptyState
            iconName="clock"
            title="No events yet"
            subtitle="Switch to Month view and tap a day, or tap + to add an event."
          />
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.agendaContent}>
            {calendar.events.map((event, i) => (
              <EventRow
                key={event.id}
                event={event}
                index={i}
                onEdit={() => setEditingId(event.id)}
                onDelete={() => calendar.deleteEvent(event.id)}
              />
            ))}
          </ScrollView>
        )
      )}

      {/* ── Edit sheet ────────────────────────────────────────────── */}
      <EventEditSheet
        visible={editingId !== null}
        event={editingEvent}
        onClose={() => setEditingId(null)}
        onPatch={(id, patch) => calendar.patchEvent(id, patch)}
        onDelete={(id) => { setEditingId(null); calendar.deleteEvent(id); }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  monthLabel: {
    minWidth: 140,
    textAlign: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },

  // Month grid
  scroll: { flex: 1 },
  monthContent: {
    paddingTop: spacing.sm,
  },

  // Agenda
  agendaContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
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

  // Month grid event chips
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radii.xs,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginBottom: 1,
  },
  eventChipDot: {
    width: 5,
    height: 5,
    borderRadius: radii.pill,
    flexShrink: 0,
  },
  eventChipLabel: {
    flex: 1,
    flexShrink: 1,
  },
  moreLabel: {
    paddingHorizontal: 4,
  },

  // Edit sheet
  editRoot: { gap: spacing.lg },
  editSection: { gap: spacing.sm },

  colorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
  },
});
