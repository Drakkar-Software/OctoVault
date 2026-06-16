import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { layout, spacing } from '@/theme';
import { useQuickCreate } from '@/lib/use-quick-create';
import { useInShell } from '@/lib/use-responsive';
import { useSpaces } from '@/lib/use-spaces';
import { AppBar } from '@/components/ui/AppBar';
import { IconButton } from '@/components/ui/IconButton';
import { Stage } from '@/components/ui/Stage';
import { StackScreen } from '@/components/ui/StackScreen';
import { SpaceSwitcher } from '@/components/work/SpaceSwitcher';
import { WorkNoSpaces } from '@/components/work/WorkEmpty';
import { WorkHome } from '@/components/work/WorkHome';
import { WorkObjects } from '@/components/work/WorkObjects';

/**
 * Vault tab — the workspace landing. On phones the AppBar title IS the space
 * switcher (the only mobile path between spaces) with quick-create + profile on
 * the right; the body is the live tree ({@link WorkObjects}). On desktop the
 * sidebar already shows the tree, so the main pane renders {@link WorkHome}
 * (recents + quick create) instead of mirroring it. Zero spaces — a brand-new
 * identity — gets a live "create your first space" door, never disabled chrome.
 */
export default function WorkScreen() {
  const router = useRouter();
  const inShell = useInShell();
  const { spaces, activeId, loading } = useSpaces();
  const { newPage } = useQuickCreate();
  const space = spaces.find((s) => s.id === activeId) ?? spaces[0];

  if (!loading && spaces.length === 0) {
    return (
      <StackScreen
        inTabs
        header={<AppBar title="OctoVault" titleNode={<SpaceSwitcher variant="appbar" />} />}
        contentStyle={styles.content}
      >
        <WorkNoSpaces />
      </StackScreen>
    );
  }

  return (
    <StackScreen
      inTabs
      scroll
      header={
        <AppBar
          title={space?.name ?? 'Vault'}
          titleNode={<SpaceSwitcher variant="appbar" />}
          right={
            <IconButton name="plus" onPress={newPage} tooltip="New page" accessibilityLabel="New page" />
          }
        />
      }
      desktopHeader={
        <AppBar
          title={space?.name ?? 'Vault'}
          right={
            space ? (
              <IconButton
                name="gear"
                onPress={() => router.push({ pathname: '/space/[id]', params: { id: space.id } })}
                tooltip="Space settings"
                accessibilityLabel="Space settings"
              />
            ) : null
          }
        />
      }
      contentStyle={styles.content}
    >
      <Stage maxWidth={layout.listMaxWidth} style={styles.stage}>
        {inShell ? <WorkHome spaceId={space?.id ?? null} /> : <WorkObjects spaceId={space?.id ?? null} hero />}
      </Stage>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  // Deep bottom inset so the last rows clear the tab bar / scroll comfortably.
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxxl * 2 },
  stage: { paddingTop: spacing.sm },
});
