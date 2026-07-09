import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { layout, spacing } from '@/theme';
import { setSidebarCollapsedPref } from '@/lib/use-nav-prefs';
import { useNewNote, useNotesMode } from '@/lib/use-notes';
import { useOpenObjectId } from '@/lib/use-open-object-id';
import { useProfile } from '@/lib/profile-context';
import { openQuickFind } from '@/lib/use-quick-find';
import { useQuickCreate } from '@/lib/use-quick-create';
import { formatShortcut } from '@/lib/use-shortcuts';
import { useSpaces } from '@/lib/use-spaces';
import { useTheme } from '@/lib/use-theme';
import { initialsFor } from '@drakkar.software/octovault-sdk';
import { Sidebar, SidebarHeader, SpacesRail } from '@drakkar.software/dk-spaces-ui';
import type { RailIconName, RailSpace } from '@drakkar.software/dk-spaces-ui';
import { useBrand } from '@/lib/brand-context';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Txt } from '@/components/ui/Txt';
import { SpaceSwitcher } from '@/components/work/SpaceSwitcher';
import { WorkNotes } from '@/components/work/WorkNotes';
import { WorkObjects } from '@/components/work/WorkObjects';

// ── RailIconName → OctoVault IconName mapping ─────────────────────────────────

const RAIL_ICON: Record<RailIconName, IconName> = {
  dm: 'dm',
  lock: 'lock',
  mute: 'volume-off',
  add: 'plus',
  notes: 'book',
};

/**
 * Persistent left navigation of the OctoVault desktop shell: the compact spaces
 * rail (via SpacesRail from dk-spaces-ui) and the active space's sidebar panel
 * (SpaceSwitcher header over the workspace tree, via Sidebar + SidebarHeader).
 *
 * Rendered once by {@link AppFrame} on wide viewports, inside its collapsible
 * wrapper (mod+\). The sidebar header is the shell's quiet command strip —
 * SpaceSwitcher, search, new page, collapse — every icon tooltipped with its
 * shortcut because icon-only chrome is unguessable otherwise.
 */
export function WorkspaceNav() {
  const router = useRouter();
  const { colors } = useTheme();
  const { profile } = useProfile();
  const { spaces, activeId, switchSpace } = useSpaces();
  const { newPage } = useQuickCreate();
  const { newNote } = useNewNote();
  const { has } = useBrand();
  const openObjectId = useOpenObjectId();
  const space = spaces.find((s) => s.id === activeId) ?? spaces[0];

  // Notes mode swaps the space sidebar (switcher + tree) for the personal
  // notes list — and sticks while the open object is a note, so opening a
  // note from the list doesn't flip the sidebar back to the space tree.
  const notesMode = useNotesMode();

  const railSpaces: RailSpace[] = spaces.map((s) => ({
    id: s.id,
    name: s.name,
    // `short` is required by RailSpace; Space.short is optional (seeded by onSpaceMeta).
    short: s.short ?? initialsFor(s.name),
    image: s.image,
    unread: s.unread,
  }));

  return (
    <>
      <SpacesRail
        spaces={railSpaces}
        activeId={activeId ?? null}
        onSelect={switchSpace}
        onAdd={() => router.push('/join')}
        addLabel="Join or create a space"
        specialTiles={
          has('notes')
            ? [{ key: 'notes', icon: 'notes', active: notesMode, label: 'My Notes', onPress: () => router.navigate('/(tabs)/notes') }]
            : undefined
        }
        renderIcon={(name, size, color) => (
          <Icon name={RAIL_ICON[name]} size={size} color={color} />
        )}
        renderTileImage={(space) => (
          <Image
            source={{ uri: space.image! }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={space.short}
          />
        )}
        renderBadge={(count) => <Badge count={count} />}
        renderFoot={() => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={() => router.push('/you')}
            style={styles.foot}
          >
            <Avatar
              label={initialsFor(profile?.name ?? '')}
              image={profile?.avatar}
              size={layout.railTileSize}
            />
          </Pressable>
        )}
      />

      <Sidebar
        header={
          <SidebarHeader
            style={styles.head}
            leading={
              notesMode ? (
                <View style={styles.notesHead}>
                  <Icon name="book" size={15} color={colors.inkMuted} />
                  <Txt variant="heading" weight="semibold" numberOfLines={1}>
                    My Notes
                  </Txt>
                </View>
              ) : (
                <SpaceSwitcher variant="sidebar" />
              )
            }
            actions={
              <View style={styles.headActions}>
                <IconButton
                  name="search"
                  size={15}
                  onPress={openQuickFind}
                  tooltip="Search"
                  shortcut={formatShortcut('mod+k')}
                  accessibilityLabel="Search"
                />
                <IconButton
                  name="plus"
                  size={15}
                  onPress={notesMode ? newNote : newPage}
                  tooltip={notesMode ? 'New note' : 'New page'}
                  shortcut={notesMode ? undefined : formatShortcut('mod+n')}
                  accessibilityLabel={notesMode ? 'New note' : 'New page'}
                />
                <IconButton
                  name="sidebar"
                  size={15}
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
        {notesMode ? (
          <WorkNotes />
        ) : (
          <WorkObjects spaceId={space?.id ?? null} selectedId={openObjectId ?? undefined} />
        )}
      </Sidebar>
    </>
  );
}

const styles = StyleSheet.create({
  foot: { alignItems: 'center' },
  head: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  notesHead: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  tree: { paddingHorizontal: spacing.sm, paddingBottom: spacing.lg },
});
