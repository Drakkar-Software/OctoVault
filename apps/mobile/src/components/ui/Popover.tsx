import { useEffect, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { View as ViewType, ViewStyle } from 'react-native';
import { Dimensions, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { dropShadow, layers, layout, paperBorder, radii, shadows, spacing } from '@/theme';
import { useTheme } from '@/lib/use-theme';

export type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'right-start';

interface PopoverProps {
  visible: boolean;
  onClose: () => void;
  /** The trigger the card hangs off — measured in window coordinates on open. */
  anchorRef: RefObject<ViewType | null>;
  /** Which anchor edge the card attaches to. Default: below, left-aligned. */
  placement?: PopoverPlacement;
  /** Fixed card width; content sizes itself (min `layout.menuMinWidth`) when omitted. */
  width?: number;
  /** Height cap — always further clamped to the space left in the viewport. */
  maxHeight?: number;
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

/** Gap between the anchor edge and the card. */
const GAP = spacing.xs;
/** Breathing room always kept between the card and the viewport edge. */
const EDGE = spacing.sm;

/**
 * Anchored popover — the positioning layer every context/handle/switcher menu
 * hangs off (desktop's loudest "not Notion" tell was menus detaching from their
 * trigger). Cross-platform by construction: the anchor is measured with
 * `measureInWindow` and the card is absolutely positioned inside a transparent
 * RN `Modal`, so the exact same code runs on iOS/Android/web — no portal lib,
 * no DOM. The backdrop is deliberately scrim-free (a popover is lightweight
 * chrome, not a modal moment); outside tap, Escape (web) and hardware back
 * (Android, via `onRequestClose`) all dismiss.
 *
 * Placement uses `top`/`bottom`/`left` so the primary axis never needs the
 * card's size up front; the card renders invisibly for one frame, measures via
 * `onLayout`, then clamps itself fully inside the viewport and appears.
 */
export function Popover({ visible, onClose, anchorRef, placement = 'bottom-start', width, maxHeight, children }: PopoverProps) {
  const { colors } = useTheme();
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [size, setSize] = useState<Size | null>(null);

  // (Re)measure the anchor on every open — the window scrolls and resizes
  // between opens, so a cached rect would drift away from the trigger.
  useEffect(() => {
    if (!visible) {
      setAnchor(null);
      setSize(null);
      return;
    }
    anchorRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  }, [visible, anchorRef]);

  // Web has no hardware back; close on Escape to match the native affordance.
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  // Nothing mounts until the anchor rect lands (one effect tick after open).
  if (!visible || !anchor) return null;

  const win = Dimensions.get('window');
  // Until the card reports its own size, estimate from the requested width so
  // end-aligned placements start in roughly the right spot (it's invisible
  // while measuring anyway).
  const estW = size?.w ?? width ?? layout.menuMinWidth;
  const estH = size?.h ?? 0;

  let top: number | undefined;
  let bottom: number | undefined;
  let left: number;
  /** Vertical space available from the card's attach point to the viewport edge. */
  let avail: number;
  switch (placement) {
    case 'bottom-end':
      left = anchor.x + anchor.w - estW;
      top = anchor.y + anchor.h + GAP;
      avail = win.height - top - EDGE;
      break;
    case 'top-start':
      left = anchor.x;
      // Anchoring by `bottom` lets the card grow upward without knowing its height.
      bottom = win.height - anchor.y + GAP;
      avail = anchor.y - GAP - EDGE;
      break;
    case 'right-start':
      left = anchor.x + anchor.w + GAP;
      top = anchor.y;
      avail = win.height - anchor.y - EDGE;
      break;
    case 'bottom-start':
    default:
      left = anchor.x;
      top = anchor.y + anchor.h + GAP;
      avail = win.height - top - EDGE;
      break;
  }
  // Clamp fully inside the viewport (with EDGE padding) once measured.
  left = Math.max(EDGE, Math.min(left, win.width - estW - EDGE));
  if (top !== undefined) top = Math.max(EDGE, Math.min(top, win.height - estH - EDGE));
  const cardMaxHeight = Math.max(0, Math.min(maxHeight ?? avail, avail));

  const position: ViewStyle = { position: 'absolute', top, bottom, left };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Scrim-free backdrop: closes on outside tap without dimming the page. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
      <View
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
        }}
        style={[
          styles.card,
          paperBorder(colors),
          dropShadow(colors.shadow, 'md'),
          position,
          width !== undefined ? { width } : null,
          { maxWidth: win.width - EDGE * 2 },
          size ? null : styles.measuring,
        ]}
      >
        <ScrollView
          style={{ maxHeight: cardMaxHeight }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: layout.menuMinWidth,
    borderRadius: radii.lg,
    borderWidth: 1,
    zIndex: layers.popover,
  },
  // First frame only: laid out (so onLayout fires) but not yet visible, to avoid
  // a flash at the pre-clamp position.
  measuring: { opacity: 0 },
});
