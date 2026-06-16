import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { View as ViewType, ViewProps, ViewStyle } from 'react-native';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';

import { dropShadow, layers, motion, opacity, radii, shadows, spacing } from '@/theme';
import { useTheme } from '@/lib/use-theme';

import { Txt } from './Txt';

interface TooltipProps {
  /** Short action name, e.g. "New page". */
  label: string;
  /** Optional keyboard hint rendered mono after the label, e.g. "⌘N". */
  shortcut?: string;
  children: ReactNode;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Size {
  w: number;
  h: number;
}

// `position: fixed` is a web-only style RNW forwards to CSS — it pins the chip
// to the viewport so ancestor ScrollViews can't clip it. Absent from RN's types
// (the WEB_OUTLINE_RESET idiom in TextField).
const WEB_FIXED = { position: 'fixed' } as unknown as ViewStyle;

/** Gap between the child and the chip. */
const GAP = spacing.xs;
/** Breathing room kept between the chip and the viewport edge. */
const EDGE = spacing.sm;

/**
 * Web-only hover tooltip for icon-only affordances — Notion labels every icon,
 * usually with its shortcut. Wraps the child in a layout-neutral View that
 * listens for mouse enter/leave; after a dwell it measures the child via
 * `measureInWindow` and pins an inverted chip (`tooltipBg`/`onTooltip`)
 * centered below it (above when there's no room), clamped to the viewport.
 * Native has no pointer: the child renders untouched (rely on
 * `accessibilityLabel` + long-press affordances there).
 */
function WebTooltip({ label, shortcut, children }: TooltipProps) {
  const { colors } = useTheme();
  const wrapRef = useRef<ViewType>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [chip, setChip] = useState<Size | null>(null);

  const hide = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setRect(null);
    setChip(null);
  };
  const onEnter = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      wrapRef.current?.measureInWindow((x, y, w, h) => setRect({ x, y, w, h }));
    }, motion.tooltipDelay);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Mouse handlers are web-only DOM props absent from RN's ViewProps types
  // (the useRowHover idiom). Hiding on mousedown keeps the chip from lingering
  // over whatever the click opens.
  const hoverProps = {
    onMouseEnter: onEnter,
    onMouseLeave: hide,
    onMouseDown: hide,
  } as unknown as Partial<ViewProps>;

  let position: ViewStyle | null = null;
  if (rect) {
    const win = Dimensions.get('window');
    const w = chip?.w ?? 0;
    const h = chip?.h ?? 0;
    const below = rect.y + rect.h + GAP;
    // Flip above the child when the chip would fall off the bottom edge.
    const top = below + h + EDGE > win.height ? rect.y - h - GAP : below;
    const left = Math.max(EDGE, Math.min(rect.x + rect.w / 2 - w / 2, win.width - w - EDGE));
    position = { top, left };
  }

  return (
    <View ref={wrapRef} {...hoverProps}>
      {children}
      {rect ? (
        <View
          pointerEvents="none"
          onLayout={(e) => {
            const { width: w, height: h } = e.nativeEvent.layout;
            setChip((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
          }}
          style={[styles.chip, WEB_FIXED, dropShadow(colors.shadow, 'md'), { backgroundColor: colors.tooltipBg, zIndex: layers.tooltip }, position, chip ? null : styles.measuring]}
        >
          <Txt variant="caption" weight="medium" color={colors.onTooltip} numberOfLines={1}>
            {label}
          </Txt>
          {shortcut ? (
            <Txt variant="caption" mono color={colors.onTooltip} style={styles.shortcut}>
              {shortcut}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function NativeTooltip({ children }: TooltipProps) {
  return <>{children}</>;
}

export const Tooltip = Platform.OS === 'web' ? WebTooltip : NativeTooltip;

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  shortcut: { opacity: opacity.muted },
  // First frame only: laid out (so onLayout fires) but not yet visible, to
  // avoid a flash at the pre-clamp position.
  measuring: { opacity: 0 },
});
