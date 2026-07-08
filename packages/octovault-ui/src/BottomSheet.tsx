'use client';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import BottomSheetNative, { BottomSheetView } from '@expo/ui/community/bottom-sheet';

import { useOctoUITheme } from './theme/context';

interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  /**
   * Sheet background. Defaults to the solid `paper` token so the native chrome
   * matches the content — NOT the app's translucent `surface`, which would ghost
   * the screen behind the sheet.
   */
  backgroundColor?: string;
  /**
   * Static detent(s) (e.g. `['40%']`). Overrides the native medium/large fallback
   * for short, fixed-shape content that would otherwise leave a large gap below.
   */
  snapPoints?: (string | number)[];
}

/**
 * Cross-platform modal sheet: the @expo/ui community BottomSheet drop-in —
 * SwiftUI sheet on iOS, Material3 ModalBottomSheet on Android, a CSS drawer on
 * web — hosting plain RN children (so the Ink & Pearl interior renders as-is).
 * The web default file carries no native module, so the barrel stays web-safe.
 */
export function BottomSheet({ visible, onDismiss, children, backgroundColor, snapPoints }: BottomSheetProps) {
  const theme = useOctoUITheme();
  const bg = backgroundColor ?? theme.paper;
  return (
    <BottomSheetNative
      index={visible ? 0 : -1}
      enablePanDownToClose
      onDismiss={onDismiss}
      backgroundStyle={{ backgroundColor: bg }}
      snapPoints={snapPoints}
      // iOS: fitToContents re-measures + resizes the sheet after present, which
      // desyncs the RNHostView touch handler (rows show a press state but onPress
      // never fires). Disabling dynamic sizing keeps the native medium/large
      // detents and skips that post-present resize.
      {...(Platform.OS === 'ios' ? { enableDynamicSizing: false } : {})}
    >
      <BottomSheetView>{children}</BottomSheetView>
    </BottomSheetNative>
  );
}
