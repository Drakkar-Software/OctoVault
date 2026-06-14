import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { layout, radii, spacing } from '@/theme';
import { focusRingStyle, useFocusRing } from '@/lib/focus';
import { initialsFor } from '@drakkar.software/octovault-sdk';
import { useHover } from '@/lib/use-hover';
import { setSidebarCollapsedPref } from '@/lib/use-nav-prefs';
import { useOpenObjectId } from '@/lib/use-open-object-id';
import { useProfile } from '@/lib/profile-context';
import { openQuickFind } from '@/lib/use-quick-find';
import { useQuickCreate } from '@/lib/use-quick-create';
import { formatShortcut } from '@/lib/use-shortcuts';
import { useSpaces } from '@/lib/use-spaces';
import { useTheme } from '@/lib/use-theme';
import type { Space } from '@drakkar.software/octovault-sdk';
import { Sidebar, SidebarHeader } from '@drakkar.software/octospaces-ui';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { SpaceSwitcher } from '@/components/work/SpaceSwitcher';
import { WorkObjects } from '@/components/work/WorkObjects';

/**
 * Persistent left navigation of the OctoVault desktop shell: a compact spaces
 * rail + the active space's sidebar (switcher header over the workspace tree).
 * Rendered once by {@link AppFrame} on wide viewports, inside its collapsible
 * wrapper (mod+\). The sidebar header is the shell's quiet command strip —
 * SpaceSwitcher, search, new page, collapse — every icon tooltipped with its
 * shortcut because icon-only chrome is unguessable otherwise.
 */
export function WorkspaceNav() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile } = useProfile();
  const { spaces, activeId, switchSpace } = useSpaces();
  const { newPage } = useQuickCreate();
  const openObjectId = useOpenObjectId();
  const space = spaces.find((s) => s.id === activeId) ?? spaces[0];

  return (
    <>
      <View style={[styles.rail, { width: layout.railWidth, backgroundColor: colors.canvas, borderRightColor: colors.lineSoft }]}>
        <ScrollView contentContainerStyle={styles.railScroll} showsVerticalScrollIndicator={false}>
          {spaces.map((s) => (
            // Switch through `switchSpace` (NOT bare setActiveId): it routes the
            // main pane home first, so the pane never shows another space's stale
            // document and the open route can't revert the switch.
            <RailTile key={s.id} space={s} active={s.id === activeId} onPress={() => switchSpace(s.id)} />
          ))}
          <Tooltip label="Join or create a space">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Join or create a space"
              onPress={() => router.push('/join')}
              style={[styles.add, { borderColor: colors.lineFaint }]}
            >
              <Icon name="plus" size={16} color={colors.inkMuted} />
            </Pressable>
          </Tooltip>
        </ScrollView>
        <Tooltip label="Profile & accounts">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile & accounts"
            onPress={() => router.push('/you')}
          >
            <Avatar label={initialsFor(profile?.name ?? '')} image={profile?.avatar} size={layout.railTileSize} />
          </Pressable>
        </Tooltip>
      </View>

      <Sidebar
        header={
          <SidebarHeader
            style={styles.head}
            leading={<SpaceSwitcher variant="sidebar" />}
            actions={
              <View style={styles.headActions}>
                <IconButton
                  name="search"
                  size={15}
                  color={colors.inkMuted}
                  // The palette, not the Search tab — desktop search IS quick-find
                  // (the tooltip advertises ⌘K, so the click must match the key).
                  onPress={openQuickFind}
                  tooltip="Search"
                  shortcut={formatShortcut('mod+k')}
                  accessibilityLabel="Search"
                />
                <IconButton
                  name="plus"
                  size={15}
                  color={colors.inkMuted}
                  onPress={newPage}
                  tooltip="New page"
                  shortcut={formatShortcut('mod+n')}
                  accessibilityLabel="New page"
                />
                <IconButton
                  name="sidebar"
                  size={15}
                  color={colors.inkMuted}
                  onPress={() => setSidebarCollapsedPref(true)}
                  tooltip="Hide sidebar"
                  shortcut={formatShortcut('mod+\\')}
                  accessibilityLabel="Hide sidebar"
                />
              </View>
            }
          />
        }
        contentContainerStyle={styles.tree}
      >
        <WorkObjects spaceId={space?.id ?? null} selectedId={openObjectId ?? undefined} />
      </Sidebar>
    </>
  );
}

interface RailTileProps {
  space: Space;
  active: boolean;
  onPress: () => void;
}

/** One space on the rail: its uploaded image (or monogram) with the accent ring
 *  marking the active one, named on hover — an anonymous monogram grid is
 *  unguessable past two spaces. */
function RailTile({ space, active, onPress }: RailTileProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const { focused, focusProps } = useFocusRing();
  return (
    <Tooltip label={space.name}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? `${space.name} (current space)` : `Switch to ${space.name}`}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        {...hoverProps}
        {...focusProps}
        style={({ pressed }) => [
          styles.tile,
          pressed ? { backgroundColor: colors.pressed } : hovered ? { backgroundColor: colors.hover } : null,
          focused && focusRingStyle(colors),
        ]}
      >
        <Avatar
          label={(space.short || space.name.slice(0, 2)).toUpperCase()}
          image={space.image}
          size={layout.railTileSize}
          ring={active}
        />
      </Pressable>
    </Tooltip>
  );
}

const styles = StyleSheet.create({
  rail: { borderRightWidth: 1, alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  railScroll: { alignItems: 'center', gap: spacing.sm, flexGrow: 1 },
  /** Hover/press wash hugs the avatar (pill, slight inset breathing room). */
  tile: { padding: 2, borderRadius: radii.pill },
  add: {
    width: layout.railTileSize,
    height: layout.railTileSize,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // head — passed as SidebarHeader.style; provides only the outer padding.
  // SidebarHeader owns the flex-row layout internally.
  head: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tree: { paddingHorizontal: spacing.sm, paddingBottom: spacing.lg },
});
