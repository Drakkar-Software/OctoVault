import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Dimensions, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dropShadow, layers, layout, motion, paperBorder, radii, shadows, spacing } from '@/theme';
import { useResponsive } from '@/lib/use-responsive';
import { useTheme } from '@/lib/use-theme';

import { IconButton } from './IconButton';
import { Txt } from './Txt';

export type SheetPresentation = 'auto' | 'sheet' | 'dialog' | 'panel';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Optional header row: serif title + a close button. */
  title?: string;
  /** Back chevron rendered before the title — lets a sheet swap between sub-views
   *  without closing and reopening the Modal (avoids the two-Modal race on native). */
  onBack?: () => void;
  /**
   * `auto` (default) follows the viewport: bottom sheet on phones, centered
   * dialog on wide screens. `panel` docks a full-height pane on the right
   * (board task side-peek). Force `sheet`/`dialog` when a surface should keep
   * one shape everywhere.
   */
  presentation?: SheetPresentation;
  /** dialog: max card width; panel: pane width. Sensible defaults per shape. */
  width?: number;
  /**
   * dialog only: `top` pins the card near the viewport top (`layout.dialogTopOffset`)
   * so a list growing/shrinking under the input (the command palette) extends
   * downward instead of re-centering on every keystroke. Default `center`.
   */
  align?: 'center' | 'top';
  children: ReactNode;
  /** Pinned action row below the scrollable body (e.g. dialog buttons). */
  footer?: ReactNode;
}

/**
 * The app's single modal surface — replaces every hand-rolled `Modal` sheet
 * (TaskDetailSheet / ObjectActions / BlockTypeMenu each re-rolled scrim + card
 * + dismissal with drifting styles and a flat fade). One scrim, one card, three
 * shapes:
 *
 * - **sheet** — bottom sheet that springs up (`motion.spring`), drag-handle
 *   pill, `radii.sheet` top corners, safe-area bottom padding.
 * - **dialog** — centered paper card, fade + small rise, `radii.xl`.
 * - **panel** — right-docked full-height pane (`layout.peekPaneWidth`) sliding
 *   in from the right edge.
 *
 * Dismissal is uniform everywhere: backdrop tap, Escape (web) and hardware
 * back (Android, via `onRequestClose`). The card animates out before the Modal
 * unmounts (RN Modal kills children instantly otherwise), driven by a small
 * mounted-state machine.
 */
export function Sheet({ visible, onClose, title, onBack, presentation = 'auto', width, align = 'center', children, footer }: SheetProps) {
  const { colors } = useTheme();
  const { isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  const mode: Exclude<SheetPresentation, 'auto'> = presentation === 'auto' ? (isWide ? 'dialog' : 'sheet') : presentation;
  const panelWidth = width ?? layout.peekPaneWidth;

  // Keep the Modal alive past `visible=false` so the exit animation can play,
  // then unmount. Re-opening mid-exit cancels the pending unmount.
  const [mounted, setMounted] = useState(visible);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 0 = hidden (offscreen / transparent) → 1 = settled. Drives scrim + card. */
  const progress = useSharedValue(0);
  /** Bottom-sheet travel: the measured card height (start far offscreen until known). */
  const slideFrom = useSharedValue(Dimensions.get('window').height);

  useEffect(() => {
    if (visible) {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setMounted(true);
    } else if (mounted) {
      progress.value = withTiming(0, { duration: motion.fast });
      closeTimer.current = setTimeout(() => setMounted(false), motion.fast);
    }
  }, [visible, mounted, progress]);

  // Enter only after the Modal's content is actually mounted, so the first
  // painted frame sits at progress 0 (offscreen) and animates from there.
  useEffect(() => {
    if (visible && mounted) {
      progress.value = mode === 'dialog' ? withTiming(1, { duration: motion.base }) : withSpring(1, motion.spring);
    }
  }, [visible, mounted, mode, progress]);

  // Clear a pending unmount timer if the owner unmounts us mid-exit.
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  // Web has no hardware back; close on Escape to match the native affordance.
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const scrimAnim = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardAnim = useAnimatedStyle(() => {
    switch (mode) {
      case 'sheet':
        return { transform: [{ translateY: (1 - progress.value) * slideFrom.value }] };
      case 'panel':
        // A touch past the pane width so its shadow fully clears the edge.
        return { transform: [{ translateX: (1 - progress.value) * (panelWidth + spacing.xl) }] };
      case 'dialog':
        return { opacity: progress.value, transform: [{ translateY: (1 - progress.value) * spacing.lg }] };
    }
  }, [mode, panelWidth]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={[
          styles.root,
          mode === 'sheet' && styles.rootSheet,
          mode === 'dialog' && (align === 'top' ? styles.rootDialogTop : styles.rootDialog),
          mode === 'panel' && styles.rootPanel,
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrimAnim]}>
          <Pressable style={styles.scrimPress} onPress={onClose} accessibilityLabel="Dismiss" />
        </Animated.View>
        <Animated.View
          onLayout={(e) => {
            slideFrom.value = e.nativeEvent.layout.height + spacing.xl;
          }}
          style={[
            styles.card,
            dropShadow(colors.shadow, 'lg'),
            mode === 'sheet' && [
              styles.cardSheet,
              paperBorder(colors),
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
            ],
            mode === 'dialog' && [styles.cardDialog, paperBorder(colors), { maxWidth: width ?? layout.dialogMaxWidth }],
            mode === 'panel' && [
              styles.cardPanel,
              {
                width: panelWidth,
                backgroundColor: colors.paper,
                borderLeftColor: colors.lineSoft,
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
              },
            ],
            cardAnim,
          ]}
        >
          {mode === 'sheet' ? <View style={[styles.handle, { backgroundColor: colors.fillDeep }]} /> : null}
          {title ? (
            <View style={styles.titleRow}>
              {onBack ? <IconButton name="arrow-l" size={18} onPress={onBack} accessibilityLabel="Back" /> : null}
              <Txt variant="heading" numberOfLines={1} style={styles.title}>
                {title}
              </Txt>
              <IconButton name="x" size={18} onPress={onClose} accessibilityLabel="Close" />
            </View>
          ) : null}
          <ScrollView
            style={mode === 'panel' ? styles.scrollPanel : styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, { borderTopColor: colors.lineFaint }]}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootSheet: { justifyContent: 'flex-end', alignItems: 'center' },
  rootDialog: { justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  // Top-pinned dialog (command palette): card stays put while results reflow.
  rootDialogTop: { justifyContent: 'flex-start', alignItems: 'center', padding: spacing.xl, paddingTop: layout.dialogTopOffset },
  rootPanel: { flexDirection: 'row', justifyContent: 'flex-end' },
  scrimPress: { flex: 1 },
  card: { zIndex: layers.modal },
  cardSheet: {
    width: '100%',
    maxWidth: layout.editorMaxWidth,
    maxHeight: '85%',
    borderWidth: 1,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
  },
  cardDialog: {
    width: '100%',
    maxHeight: '85%',
    borderWidth: 1,
    borderRadius: radii.xl,
  },
  cardPanel: {
    height: '100%',
    borderLeftWidth: 1,
  },
  handle: {
    alignSelf: 'center',
    width: spacing.xxl,
    height: spacing.xs,
    borderRadius: radii.pill,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  title: { flex: 1 },
  // Shrink (scroll) when content outgrows the card's max height, but never
  // stretch a short sheet/dialog taller than its content.
  scroll: { flexGrow: 0, flexShrink: 1 },
  // The docked pane always fills its full height.
  scrollPanel: { flex: 1 },
  body: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
