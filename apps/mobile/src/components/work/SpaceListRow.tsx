import { Platform, Pressable, StyleSheet } from 'react-native';

import { radii, spacing } from '@/theme';
import { focusRingStyle, useFocusRing } from '@/lib/focus';
import { useHover } from '@/lib/use-hover';
import { useTheme } from '@/lib/use-theme';
import type { Space } from '@drakkar.software/octovault-sdk';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Txt } from '@/components/ui/Txt';

/** Space monogram fallback when no image is set. */
const monogram = (s: Space) => (s.short || s.name.slice(0, 2)).toUpperCase();

interface SpaceListRowProps {
  space: Space;
  /** Whether this is the currently active space (shows a trailing check mark). */
  active: boolean;
  onPress: () => void;
}

/**
 * A single space row — avatar, name, and a trailing check when active. Used in
 * both the mobile SpaceSwitcher sheet and the standalone {@link SpacesScreen}.
 * Mirrors {@link MenuItem}'s row metrics so rows sit flush with icon rows when
 * rendered inside a {@link Menu}.
 */
export function SpaceListRow({ space, active, onPress }: SpaceListRowProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const { focused, focusProps } = useFocusRing();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? `${space.name} (current)` : `Switch to ${space.name}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      {...hoverProps}
      {...focusProps}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.pressed } : hovered ? { backgroundColor: colors.hover } : null,
        focused && focusRingStyle(colors),
      ]}
    >
      <Avatar label={monogram(space)} image={space.image} size={24} />
      <Txt variant="subhead" weight={active ? 'semibold' : 'regular'} numberOfLines={1} style={styles.name}>
        {space.name}
      </Txt>
      {active ? <Icon name="check" size={15} color={colors.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    minHeight: Platform.OS === 'web' ? undefined : spacing.controlMinHeight,
  },
  name: { flex: 1, minWidth: 0 },
});
