/**
 * DateTimeField — a tappable date/time selector that bridges the platform gap.
 *
 * - iOS / Android: opens the native `DateTimePicker` inline (iOS spinner or
 *   Android dialog).
 * - Web: opens a small `Sheet` with platform-native `<input type="date">`
 *   and `<input type="time">` elements styled to match the Ink & Pearl look.
 *
 * Emits ms timestamps; all-day aware (hides the time input when `allDay`).
 *
 * Usage:
 * ```tsx
 * <DateTimeField
 *   label="Start"
 *   value={event.start}
 *   allDay={event.allDay}
 *   onChange={(ms) => patchEvent(id, { start: ms })}
 * />
 * ```
 */
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { radii, spacing } from '@/theme';
import { useTheme } from '@/lib/use-theme';
import { Sheet } from './Sheet';
import { Txt } from './Txt';

// Native DateTimePicker — only required on iOS/Android
let NativeDateTimePicker: React.ComponentType<{
  value: Date;
  mode: 'date' | 'time' | 'datetime';
  display?: string;
  onChange: (event: unknown, date?: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}> | null = null;

if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NativeDateTimePicker = require('@react-native-community/datetimepicker').default;
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Build a YYYY-MM-DD string for <input type="date"> */
function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Build a HH:MM string for <input type="time"> */
function toTimeInputValue(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Merge a YYYY-MM-DD string and an HH:MM string into a ms timestamp. */
function mergeDateTime(dateStr: string, timeStr: string): number {
  return new Date(`${dateStr}T${timeStr}`).getTime();
}

// ── Web picker (inline input elements inside a Sheet) ─────────────────────────

function WebPicker({
  value,
  allDay,
  onChange,
  onClose,
  visible,
}: {
  value: number;
  allDay: boolean;
  onChange: (ms: number) => void;
  onClose: () => void;
  visible: boolean;
}) {
  const { colors } = useTheme();
  const [dateStr, setDateStr] = useState(toDateInputValue(value));
  const [timeStr, setTimeStr] = useState(toTimeInputValue(value));

  function commit(newDate: string, newTime: string) {
    const ms = mergeDateTime(newDate, newTime);
    if (!isNaN(ms)) onChange(ms);
  }

  // Shared input style — matches the Ink & Pearl TextField look
  const inputStyle = {
    fontFamily: 'SplineSans_400Regular',
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.paperAlt,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    height: 44,
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Set date & time" presentation="dialog">
      <View style={styles.webPickerBody}>
        <Txt variant="callout" tone="inkMuted" style={styles.webPickerLabel}>Date</Txt>
        <TextInput
          style={inputStyle}
          // @ts-expect-error — web-only props forwarded through RNW
          type="date"
          value={dateStr}
          onChangeText={(v) => {
            setDateStr(v);
            commit(v, timeStr);
          }}
          accessibilityLabel="Date"
        />
        {!allDay && (
          <>
            <Txt variant="callout" tone="inkMuted" style={styles.webPickerLabel}>Time</Txt>
            <TextInput
              style={inputStyle}
              // @ts-expect-error — web-only props
              type="time"
              value={timeStr}
              onChangeText={(v) => {
                setTimeStr(v);
                commit(dateStr, v);
              }}
              accessibilityLabel="Time"
            />
          </>
        )}
      </View>
    </Sheet>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface DateTimeFieldProps {
  /** Unix milliseconds for the current value. */
  value: number;
  /** Called with the new ms timestamp when the user changes the date/time. */
  onChange: (ms: number) => void;
  /** When true, only the date is shown and editable (no time component). */
  allDay?: boolean;
  /** Short label displayed above the chip, e.g. "Start" or "End". */
  label?: string;
  disabled?: boolean;
}

export function DateTimeField({ value, onChange, allDay = false, label, disabled = false }: DateTimeFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  // iOS: show a modal spinner; after picking, merge date+time
  const [nativeMode, setNativeMode] = useState<'date' | 'time'>('date');
  const [pendingDate, setPendingDate] = useState<Date>(new Date(value));

  function handleNativeChange(_event: unknown, selectedDate?: Date) {
    if (!selectedDate) { setOpen(false); return; }
    if (Platform.OS === 'android') {
      // Android picker closes itself; emit immediately
      if (nativeMode === 'date' && !allDay) {
        // Still need time — switch to time mode
        setPendingDate(selectedDate);
        setNativeMode('time');
      } else {
        const merged = allDay
          ? selectedDate.getTime()
          : new Date(
              pendingDate.getFullYear(),
              pendingDate.getMonth(),
              pendingDate.getDate(),
              selectedDate.getHours(),
              selectedDate.getMinutes(),
            ).getTime();
        onChange(merged);
        setOpen(false);
        setNativeMode('date');
      }
    } else {
      // iOS: spinner stays visible; update preview on each change
      setPendingDate(selectedDate);
    }
  }

  function handleNativeDone() {
    // iOS "Done" button equivalent — emit the pending date
    onChange(pendingDate.getTime());
    setOpen(false);
    setNativeMode('date');
  }

  return (
    <View style={styles.root}>
      {label ? (
        <Txt variant="caption" tone="inkMuted" style={styles.label}>
          {label}
        </Txt>
      ) : null}
      <Pressable
        style={[
          styles.chip,
          {
            backgroundColor: colors.paperAlt,
            borderColor: colors.lineSoft,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Date'}: ${formatDate(value)}${!allDay ? `, ${formatTime(value)}` : ''}`}
      >
        <Txt variant="callout" color={colors.ink}>
          {formatDate(value)}
        </Txt>
        {!allDay && (
          <Txt variant="callout" tone="inkMuted">
            {formatTime(value)}
          </Txt>
        )}
      </Pressable>

      {/* ── Native picker (iOS / Android) ── */}
      {Platform.OS !== 'web' && open && NativeDateTimePicker ? (
        Platform.OS === 'ios' ? (
          <Sheet visible={open} onClose={handleNativeDone} title={label ?? 'Select date'} presentation="dialog">
            <View style={styles.nativePickerWrap}>
              <NativeDateTimePicker
                value={pendingDate}
                mode={allDay ? 'date' : nativeMode}
                display="spinner"
                onChange={handleNativeChange}
              />
            </View>
          </Sheet>
        ) : (
          <NativeDateTimePicker
            value={pendingDate}
            mode={allDay ? 'date' : nativeMode}
            display="default"
            onChange={handleNativeChange}
          />
        )
      ) : null}

      {/* ── Web picker ── */}
      {Platform.OS === 'web' ? (
        <WebPicker
          visible={open}
          value={value}
          allDay={allDay}
          onChange={(ms) => { onChange(ms); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  label: {
    marginBottom: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    minHeight: 44,
  },
  nativePickerWrap: {
    paddingBottom: spacing.lg,
  },
  webPickerBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  webPickerLabel: {
    marginTop: spacing.sm,
  },
});
