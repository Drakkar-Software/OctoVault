import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dropShadow, layers, layout, motion, paperBorder, radii, shadows, spacing } from '@/theme';
import { useHover } from '@/lib/use-hover';
import { useInShell } from '@/lib/use-responsive';
import { useTheme } from '@/lib/use-theme';

import { FadeView } from './FadeView';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Txt } from './Txt';

export type ToastTone = 'neutral' | 'danger';

export interface ToastAction {
  /** Short verb, e.g. "Undo" / "Retry". */
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  message: string;
  /** Optional trailing action — pressing it also dismisses the toast. */
  action?: ToastAction;
  /** Auto-dismiss delay in ms. */
  duration?: number;
  /** `danger` adds an alert glyph + danger border for failures. */
  tone?: ToastTone;
}

export interface ToastApi {
  show: (opts: ToastOptions) => void;
}

interface ToastEntry {
  id: number;
  message: string;
  action?: ToastAction;
  tone: ToastTone;
  /** Exit in progress: fade out, then unmount after the fade. */
  leaving: boolean;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Older toasts start leaving once more than this many are live. */
const MAX_VISIBLE = 3;

/**
 * App-wide transient feedback ("Page archived — Undo", sync failures). Mounted
 * once in `AppFrame` inside a full-screen container; everywhere else calls
 * `useToast().show(...)`. Toasts stack bottom-center on phones (above the tab
 * bar) and bottom-left in the desktop shell, fade in/out via {@link FadeView},
 * and auto-dismiss — feedback, never a blocking dialog (that's `useConfirm`).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    const pending = timers.current.get(id);
    if (pending) clearTimeout(pending);
    setToasts((cur) => cur.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    // Keep the entry mounted through the exit fade, then drop it.
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setToasts((cur) => cur.filter((t) => t.id !== id));
      }, motion.fast),
    );
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      setToasts((cur) => [
        ...cur,
        { id, message: opts.message, action: opts.action, tone: opts.tone ?? 'neutral', leaving: false },
      ]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), opts.duration ?? motion.toastDuration),
      );
    },
    [dismiss],
  );

  // Cap the stack: when a fourth live toast arrives, the oldest starts leaving.
  useEffect(() => {
    const live = toasts.filter((t) => !t.leaving);
    if (live.length > MAX_VISIBLE) dismiss(live[0].id);
  }, [toasts, dismiss]);

  // Drop every pending timer with the provider (e.g. sign-out remount).
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Imperative toast handle. Must be used under {@link ToastProvider}. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

interface ToastHostProps {
  toasts: ToastEntry[];
  onDismiss: (id: number) => void;
}

/**
 * The render queue. Absolutely positioned over the app (the provider's parent
 * must be the full-screen shell container); `box-none` so the page stays
 * interactive between toasts. Oldest renders first, so the newest toast sits
 * closest to the screen edge.
 */
function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  const inShell = useInShell();
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        { zIndex: layers.toast },
        inShell
          ? styles.hostShell
          : [styles.hostPhone, { bottom: layout.tabBarHeight + insets.bottom + spacing.md }],
      ]}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

interface ToastItemProps {
  toast: ToastEntry;
  onDismiss: (id: number) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const { colors } = useTheme();
  // Mount at opacity 0 and flip after mount so the entry fades (Reveal's idiom);
  // `leaving` drives the exit fade before the provider unmounts the entry.
  const [entered, setEntered] = useState(false);
  useEffect(() => setEntered(true), []);
  const visible = entered && !toast.leaving;
  const danger = toast.tone === 'danger';

  return (
    <FadeView visible={visible} duration={visible ? motion.base : motion.fast} style={styles.item}>
      <View
        accessibilityLiveRegion="polite"
        style={[
          styles.card,
          paperBorder(colors, danger ? colors.dangerBorder : undefined),
          dropShadow(colors.shadow, 'lg'),
        ]}
      >
        {danger ? <Icon name="alert" size={16} color={colors.danger} /> : null}
        <Txt variant="callout" style={styles.message} numberOfLines={3}>
          {toast.message}
        </Txt>
        {toast.action ? (
          <ToastActionButton
            label={toast.action.label}
            onPress={() => {
              toast.action?.onPress();
              onDismiss(toast.id);
            }}
          />
        ) : null}
        <IconButton
          name="x"
          size={14}
          color={colors.inkMuted}
          accessibilityLabel="Dismiss notification"
          onPress={() => onDismiss(toast.id)}
        />
      </View>
    </FadeView>
  );
}

interface ToastActionButtonProps {
  label: string;
  onPress: () => void;
}

/** Quiet accent text button — the toast's single optional verb (e.g. "Undo"). */
function ToastActionButton({ label, onPress }: ToastActionButtonProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      {...hoverProps}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: pressed ? colors.pressed : hovered ? colors.hover : 'transparent' },
      ]}
    >
      <Txt variant="callout" weight="semibold" tone="accent">
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    gap: spacing.sm,
  },
  /** Desktop shell: bottom-left, fixed column. */
  hostShell: {
    left: spacing.xl,
    bottom: spacing.xl,
    width: layout.toastWidth,
  },
  /** Phones: bottom-center, capped to the toast width inside screen padding. */
  hostPhone: {
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.screenX,
  },
  item: {
    width: '100%',
    maxWidth: layout.toastWidth,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.lg,
  },
  message: {
    flex: 1,
    paddingVertical: spacing.xs,
  },
  action: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
});
