import type { ReactNode } from 'react';

import { Lightbox as LightboxOverlay } from '@drakkar.software/dk-spaces-ui';

import { useTheme } from '@/lib/use-theme';
import { IconButton } from './IconButton';

export interface LightboxProps {
  visible: boolean;
  onClose: () => void;
  /** Centered content (e.g. a full-size image rendered by the caller). */
  children: ReactNode;
  /** Accessible label for the close affordance. Default: "Close preview". */
  closeLabel?: string;
  /** Optional save/share action in the bottom-right corner. */
  onShare?: () => void;
  /** Accessible label for the share button. */
  shareLabel?: string;
}

/**
 * Full-screen image-preview overlay. Tapping the backdrop, the ✕ button,
 * Escape (web) or hardware back (Android) dismisses it.
 *
 * Delegates to the shared `Lightbox` from @drakkar.software/dk-spaces-ui and
 * wires in OctoVault's `IconButton` for chrome.
 */
export function Lightbox({
  visible,
  onClose,
  children,
  closeLabel = 'Close preview',
  onShare,
  shareLabel = 'Share',
}: LightboxProps) {
  const { colors } = useTheme();

  return (
    <LightboxOverlay
      visible={visible}
      onClose={onClose}
      closeLabel={closeLabel}
      renderCloseButton={(close) => (
        <IconButton
          name="x"
          size={26}
          color={colors.onScrim}
          onPress={close}
          accessibilityLabel={closeLabel}
          tooltip={closeLabel}
        />
      )}
      renderActions={
        onShare
          ? () => (
              <IconButton
                name="share"
                size={26}
                color={colors.onScrim}
                onPress={onShare}
                accessibilityLabel={shareLabel}
                tooltip={shareLabel}
              />
            )
          : undefined
      }
    >
      {children}
    </LightboxOverlay>
  );
}
