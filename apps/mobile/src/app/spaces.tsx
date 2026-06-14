import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { layout, spacing } from '@/theme';
import { useInShell } from '@/lib/use-responsive';
import { useSpaces } from '@/lib/use-spaces';
import { MenuItem } from '@/components/ui/Menu';
import { AppBar } from '@/components/ui/AppBar';
import { StackScreen } from '@/components/ui/StackScreen';
import { SpaceListRow } from '@/components/work/SpaceListRow';

/**
 * Full space list — shown from the mobile SpaceSwitcher sheet "See all" row
 * when the user has more than 5 spaces. Not reachable on desktop (redirects to
 * root); on desktop, space switching is handled by the SpacesRail.
 */
export default function SpacesScreen() {
  const inShell = useInShell();
  const { spaces, activeId, switchSpace } = useSpaces();

  // Desktop shell has the SpacesRail — this screen is mobile-only.
  if (inShell) {
    return <Redirect href="/(tabs)/work" />;
  }

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/work'));

  return (
    <StackScreen
      scroll
      contentStyle={styles.content}
      header={<AppBar title="Spaces" onBack={goBack} />}
    >
      <View style={styles.list}>
        {spaces.map((s) => (
          <SpaceListRow
            key={s.id}
            space={s}
            active={s.id === activeId}
            onPress={() => {
              switchSpace(s.id);
              goBack();
            }}
          />
        ))}
        <MenuItem
          icon="plus"
          label={spaces.length > 0 ? 'Join or create a space' : 'Create your first space'}
          onPress={() => router.push('/join')}
        />
      </View>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.sm,
    paddingBottom: spacing.xxxl * 2,
    maxWidth: layout.settingsColumnWidth,
    width: '100%',
    alignSelf: 'center',
  },
  list: { gap: 2 },
});
