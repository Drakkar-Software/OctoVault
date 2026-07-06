import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { radii, spacing } from '@/theme';
import { focusRingStyle, useFocusRing } from '@/lib/focus';
import { useHover } from '@/lib/use-hover';
import { useSpaces } from '@/lib/use-spaces';
import { useTheme } from '@/lib/use-theme';
import { SpaceSwitcher as PkgSpaceSwitcher } from '@drakkar.software/dk-spaces-ui';
import type { SwitcherIconName } from '@drakkar.software/dk-spaces-ui';
import { AccountSwitcher } from '@/components/account/AccountSwitcher';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';

/** Space monogram fallback when no image is set. */
const monogram = (s: { short?: string; name: string }) =>
  (s.short || s.name.slice(0, 2)).toUpperCase();

// Maps the package's SwitcherIconName to OctoVault's icon set.
const SWITCHER_ICON: Record<SwitcherIconName, IconName> = {
  'chevron-down': 'chevron-down',
  'chevron-right': 'chev-right',
  check: 'check',
  plus: 'plus',
  gear: 'gear',
  globe: 'globe',
};

interface SpaceSwitcherProps {
  /**
   * `sidebar` — the desktop sidebar header: name + avatar, press navigates to
   * the active space's settings page. No dropdown on desktop — switching spaces
   * is handled by the SpacesRail.
   * `appbar` — the phone Vault tab's AppBar title: delegates to the shared
   * package switcher, opening a bottom {@link Sheet} with the full space list
   * + account switcher. When no space exists, the trigger shows "Create a space".
   */
  variant: 'sidebar' | 'appbar';
}

/**
 * The workspace switcher — two form factors:
 *
 * **Desktop (`sidebar`):** avatar + name trigger navigates directly to
 * `/space/[id]` (the space settings / details screen). Space switching is
 * handled by the SpacesRail, so there is no dropdown here.
 *
 * **Mobile (`appbar`):** delegates to the shared `SpaceSwitcher` from
 * `@drakkar.software/dk-spaces-ui`, opening a bottom {@link Sheet} with
 * the full menu — space list, "Join or create", "Space settings", and the
 * full account section ({@link AccountSwitcher}). When no space exists the
 * trigger shows "Create a space" as an entry point to `/join`.
 */
export function SpaceSwitcher({ variant }: SpaceSwitcherProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { spaces, activeId, switchSpace } = useSpaces();
  const { hovered, hoverProps } = useHover();
  const { focused, focusProps } = useFocusRing();

  const active = spaces.find((s) => s.id === activeId) ?? spaces[0] ?? null;

  // ── Desktop sidebar: navigate straight to space details ────────────────────
  if (variant === 'sidebar') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? `${active.name} — space settings` : 'Space settings'}
        hitSlop={6}
        onPress={() => {
          if (active) {
            router.push({ pathname: '/space/[id]', params: { id: active.id } });
          } else {
            router.push('/join');
          }
        }}
        {...hoverProps}
        {...focusProps}
        style={({ pressed }) => [
          styles.triggerSidebar,
          pressed ? { backgroundColor: colors.pressed } : hovered ? { backgroundColor: colors.hover } : null,
          focused && focusRingStyle(colors),
        ]}
      >
        {active ? <Avatar label={monogram(active)} image={active.image} size={22} /> : null}
        <Txt variant="heading" weight="semibold" numberOfLines={1} style={styles.triggerName}>
          {active?.name ?? 'OctoVault'}
        </Txt>
      </Pressable>
    );
  }

  // ── Mobile appbar: shared package switcher with bottom Sheet ──────────────
  const switcherSpaces = spaces.map((s) => ({
    id: s.id,
    name: s.name,
    short: s.short,
    image: s.image,
    unread: s.unread,
  }));

  return (
    <PkgSpaceSwitcher
      spaces={switcherSpaces}
      activeId={activeId}
      onSelect={(id) => { if (id !== activeId) switchSpace(id); }}
      onAdd={() => router.push('/join')}
      onSettings={
        active
          ? () => router.push({ pathname: '/space/[id]', params: { id: active.id } })
          : undefined
      }
      maxVisible={5}
      onSeeAll={() => router.push('/spaces')}
      variant="appbar"
      emptyLabel="Create a space"
      renderTriggerAvatar={(space, size) =>
        space ? <Avatar label={monogram(space)} image={space.image} size={size} /> : null
      }
      renderSpaceAvatar={(space, size) => (
        <Avatar label={monogram(space)} image={space.image} size={size} />
      )}
      renderIcon={(name, size, color) => (
        <Icon name={SWITCHER_ICON[name]} size={size} color={color} />
      )}
      renderContainer={({ isOpen, onClose, children }) => (
        <Sheet visible={isOpen} onClose={onClose} presentation="sheet">
          {children}
        </Sheet>
      )}
      footerSlot={(close) => (
        <AccountSwitcher
          onRequestClose={close}
          onViewProfile={() => {
            close();
            router.push('/you');
          }}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  /** Sidebar header: start-aligned, shrinks with the 248px column. */
  triggerSidebar: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.md,
  },
  triggerName: { flexShrink: 1, minWidth: 0 },
});
