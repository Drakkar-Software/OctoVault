import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SWATCH_NAMES, swatches, radii, spacing } from '@/theme';
import type { SwatchName } from '@/theme';
import { relativeTime } from '@drakkar.software/octovault-sdk';
import { useCalendar, type CalendarEvent } from '@/lib/use-calendar';
import { useConfirm } from '@/lib/use-confirm';
import { useTheme } from '@/lib/use-theme';
import { AutosaveField } from '@/components/ui/AutosaveField';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { Txt } from '@/components/ui/Txt';

interface CalendarViewProps {
  spaceId: string;
  objectId: string;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

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

function pad(n: number) { return String(n).padStart(2, '0'); }

function tsToEditString(ts: number, allDay: boolean): string {
  const d = new Date(ts);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (allDay) return date;
  return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseEditString(str: string): number | null {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// ── Color picker ──────────────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (c: string | null) => void;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View style={styles.colorRow}>
      {/* "none" option */}
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

// ── Date row ──────────────────────────────────────────────────────────────────

function DateRow({
  label,
  ts,
  allDay,
  onCommit,
}: {
  label: string;
  ts: number;
  allDay: boolean;
  onCommit: (ts: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function handleBlur() {
    if (draft !== null) {
      const parsed = parseEditString(draft);
      if (parsed !== null) onCommit(parsed);
      setDraft(null);
    }
  }

  return (
    <View style={styles.dateRow}>
      <Txt variant="callout" tone="inkMuted" style={styles.dateLabel}>{label}</Txt>
      <TextField
        value={draft ?? tsToEditString(ts, allDay)}
        onChangeText={setDraft}
        onBlur={handleBlur}
        placeholder={allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:MM'}
        containerStyle={styles.dateField}
      />
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
        <TextField
          defaultValue={event.desc ?? ''}
          multiline
          plain
          placeholder="Add description…"
          onBlur={(e) => {
            const text = (e.nativeEvent as unknown as { text: string }).text;
            if (text !== undefined) onPatch(event.id, { desc: text || null });
          }}
        />

        {/* Color */}
        <View style={styles.editSection}>
          <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint">Color</Txt>
          <ColorPicker
            value={swatchColor}
            onChange={(c) => onPatch(event.id, { color: c })}
          />
        </View>

        {/* All day + dates */}
        <View style={styles.editSection}>
          <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint">Time</Txt>
          <ToggleRow
            title="All day"
            value={event.allDay}
            onValueChange={(v) => onPatch(event.id, { allDay: v })}
          />
          <DateRow
            label="Start"
            ts={event.start}
            allDay={event.allDay}
            onCommit={(ts) => onPatch(event.id, { start: ts, end: Math.max(ts, event.end) })}
          />
          <DateRow
            label="End"
            ts={event.end}
            allDay={event.allDay}
            onCommit={(ts) => onPatch(event.id, { end: Math.max(ts, event.start) })}
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

// ── Event row ─────────────────────────────────────────────────────────────────

interface EventRowProps {
  event: CalendarEvent;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}

function EventRow({ event, index, onEdit, onDelete }: EventRowProps) {
  const { colors, scheme } = useTheme();
  const confirm = useConfirm();
  const swatchKey = event.color && SWATCH_NAMES.includes(event.color as SwatchName)
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

  const editingEvent = editingId ? calendar.events.find((e) => e.id === editingId) ?? null : null;

  function addQuickEvent() {
    const now = Date.now();
    const id = calendar.addEvent({
      start: now,
      end: now + 3600_000,
      title: '',
    });
    if (id) setEditingId(id);
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
              onEdit={() => setEditingId(event.id)}
              onDelete={() => calendar.deleteEvent(event.id)}
            />
          ))}
        </ScrollView>
      )}

      {/* Edit sheet */}
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

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateLabel: { width: 40 },
  dateField: { flex: 1 },
});
