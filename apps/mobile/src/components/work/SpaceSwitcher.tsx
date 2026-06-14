import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { radii, spacing } from '@/theme';
import { focusRingStyle, useFocusRing } from '@/lib/focus';
import { useHover } from '@/lib/use-hover';
import { useSpaces } from '@/lib/use-spaces';
import { useTheme } from '@/lib/use-theme';
import type { Space } from '@drakkar.software/octovault-sdk';
import { AccountSwitcher } from '@/components/account/AccountSwitcher';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { SpaceListRow } from '@/components/work/SpaceListRow';

/** Space monogram fallback when no image is set. */
const monogram = (s: Space) => (s.short || s.name.slice(0, 2)).toUpperCase();

/** Maximum number of spaces shown inline in the mobile sheet before adding "See all". */
const SPACE_LIST_CAP = 5;

interface SpaceSwitcherProps {
  /**
   * `sidebar` — the desktop sidebar header: name + avatar, press navigates to
   * the active space's settings page. No dropdown on desktop — switching spaces
   * is handled by the SpacesRail.
   * `appbar` — the phone Vault tab's AppBar title: same trigger shape opening a
   * bottom {@link Sheet} with the full space list + account switcher.
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
 * **Mobile (`appbar`):** same trigger shape opens a bottom {@link Sheet} with
 * the full menu — space list (avatar, check on active), "Join or create",
 * "Space settings", and the full account section ({@link AccountSwitcher}).
 * When there are more than {@link SPACE_LIST_CAP} spaces, the list is capped
 * and a "See all" row navigates to `/spaces`.
 */
export function SpaceSwitcher({ variant }: SpaceSwitcherProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { spaces, activeId, switchSpace } = useSpaces();
  const { hovered, hoverProps } = useHover();
  const { focused, focusProps } = useFocusRing();
  const [open, setOpen] = useState(false);

  const active = spaces.find((s) => s.id === activeId) ?? spaces[0] ?? null;
  const close = () => setOpen(false);

  const onSelect = (id: string) => {
    close();
    if (id !== activeId) switchSpace(id);
  };

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

  // ── Mobile appbar: full sheet menu ────────────────────────────────────────
  // Cap the inline space list to SPACE_LIST_CAP; always show the active space.
  const otherSpaces = spaces.filter((s) => s.id !== active?.id);
  const cappedSpaces =
    spaces.length > SPACE_LIST_CAP
      ? [...(active ? [active] : []), ...otherSpaces.slice(0, SPACE_LIST_CAP - (active ? 1 : 0))]
      : spaces;
  const hasSeeAll = spaces.length > SPACE_LIST_CAP;

  const menu = (
    <Menu>
      {spaces.length > 0 ? <MenuLabel>Spaces</MenuLabel> : null}
      {cappedSpaces.map((s) => (
        <SpaceListRow key={s.id} space={s} active={s.id === active?.id} onPress={() => onSelect(s.id)} />
      ))}
      {hasSeeAll ? (
        <MenuItem
          icon="chev-right"
          label={`See all (${spaces.length})`}
          onPress={() => {
            close();
            router.push('/spaces');
          }}
        />
      ) : null}
      <MenuItem
        icon="plus"
        label={spaces.length > 0 ? 'Join or create a space' : 'Create your first space'}
        onPress={() => {
          close();
          router.push('/join');
        }}
      />
      {active ? (
        <MenuItem
          icon="gear"
          label="Space settings"
          onPress={() => {
            close();
            router.push({ pathname: '/space/[id]', params: { id: active.id } });
          }}
        />
      ) : null}
      <MenuSeparator />
      <MenuLabel>Account</MenuLabel>
      <AccountSwitcher onRequestClose={close} onViewProfile={() => router.push('/you')} />
    </Menu>
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? `${active.name} — switch space` : 'Switch space'}
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        onPress={() => setOpen(true)}
        {...hoverProps}
        {...focusProps}
        style={({ pressed }) => [
          styles.triggerAppbar,
          pressed ? { backgroundColor: colors.pressed } : hovered ? { backgroundColor: colors.hover } : null,
          focused && focusRingStyle(colors),
        ]}
      >
        {active ? <Avatar label={monogram(active)} image={active.image} size={22} /> : null}
        <Txt variant="heading" weight="semibold" numberOfLines={1} style={styles.triggerName}>
          {active?.name ?? 'OctoVault'}
        </Txt>
        <Icon name="chev-down" size={14} color={colors.inkMuted} />
      </Pressable>
      <Sheet visible={open} onClose={close} presentation="sheet">
        {menu}
      </Sheet>
    </>
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
  /** AppBar title slot: centered within the flexible middle region. */
  triggerAppbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
  },
  triggerName: { flexShrink: 1, minWidth: 0 },
});
