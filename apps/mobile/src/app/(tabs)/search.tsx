import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { layout, spacing } from '@/theme';
import { quickFindKeyHandlers, useQuickFind } from '@/lib/use-quick-find';
import { useObjectDirectory } from '@/lib/use-object-directory';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/use-theme';
import { useTypeRegistry } from '@/lib/type-registry-context';
import { AppBar } from '@/components/ui/AppBar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { QuickFindResults } from '@/components/ui/CommandPalette';
import { Segmented, type SegmentedOption } from '@/components/ui/Segmented';
import { SignInPrompt } from '@/components/ui/SignInPrompt';
import { StackScreen } from '@/components/ui/StackScreen';
import { TextField } from '@/components/ui/TextField';

import { filterDiscoverEntries, DiscoverList } from '@drakkar.software/dk-spaces-ui';
import type { DiscoverEntry } from '@drakkar.software/dk-spaces-ui';
import { routeForNode } from '@drakkar.software/octovault-sdk';

type SearchMode = 'content' | 'discover';

const MODE_OPTIONS: SegmentedOption<SearchMode>[] = [
  { value: 'content', label: 'Content' },
  { value: 'discover', label: 'Discover' },
];

/**
 * Search tab — one search box, two modes:
 *  - Content: the Quick Find brain (`lib/use-quick-find`) over the active space's
 *    pages/boards — recents, ranked title matches, create/switch actions.
 *  - Discover: the public-object directory filtered by the same query, scoped to the
 *    user's member spaces (`lib/use-object-directory` + `DiscoverList`).
 *
 * The mode toggle reuses the `Segmented` control; the two modes share a single
 * `<TextField>` so the query transfers seamlessly when switching.
 */
export default function SearchScreen() {
  const { session } = useSession();
  const { colors } = useTheme();
  const registry = useTypeRegistry();

  // Hook order: called before the signed-out gate (safe without a session — the index
  // is simply empty then).
  const find = useQuickFind();

  const [mode, setMode] = useState<SearchMode>('content');

  // Load the public directory only while in Discover mode.
  const dir = useObjectDirectory({ enabled: mode === 'discover' });

  // Soft-refresh the directory whenever the Search tab comes back into focus while
  // in Discover mode — mirrors the old Discover tab's useFocusEffect behaviour.
  useFocusEffect(
    useCallback(() => {
      if (mode === 'discover') dir.reload();
    }, [mode, dir.reload]),
  );

  // Derive the filtered discover list from the shared query.
  const discoverEntries = useMemo(
    () => filterDiscoverEntries(dir.entries, find.query),
    [dir.entries, find.query],
  );

  const renderIcon = useCallback(
    (entry: DiscoverEntry) => <Icon name={registry.iconForNode({ type: entry.type })} size={16} />,
    [registry],
  );

  const onOpen = useCallback((entry: DiscoverEntry) => {
    router.push({
      pathname: routeForNode({ type: entry.type }),
      params: {
        id: entry.id,
        spaceId: entry.spaceId,
        label: entry.title,
        ...(entry.emoji ? { emoji: entry.emoji } : {}),
      },
    });
  }, []);

  if (!session) {
    return (
      <StackScreen
        header={<AppBar title="Search" />}
      >
        <SignInPrompt subtitle="Sign in to search your workspace." />
      </StackScreen>
    );
  }

  const placeholder =
    mode === 'discover'
      ? 'Search public objects…'
      : find.spaceName
      ? `Search ${find.spaceName}…`
      : 'Search pages & boards…';

  // Discover body — loading / error / list
  const discoverBody =
    dir.status === 'loading' ? (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    ) : dir.status === 'error' ? (
      <View style={styles.center}>
        <EmptyState iconName="alert" title="Couldn't load" subtitle={dir.error ?? undefined}>
          <Button label="Retry" variant="secondary" onPress={dir.reload} />
        </EmptyState>
      </View>
    ) : (
      <DiscoverList
        entries={discoverEntries}
        renderIcon={renderIcon}
        onOpen={onOpen}
        emptyMessage={
          find.query.trim() ? `No results for "${find.query.trim()}"` : 'No public objects yet'
        }
        refreshing={dir.refreshing}
        onRefresh={dir.reload}
      />
    );

  return (
    <StackScreen
      header={
        <AppBar
          title="Search"
          subtitle={mode === 'content' ? (find.spaceName ?? undefined) : undefined}
        />
      }
      contentStyle={styles.content}
    >
      <TextField
        leadingIcon="search"
        value={find.query}
        onChangeText={find.setQuery}
        placeholder={placeholder}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="go"
        blurOnSubmit={false}
        // Arrow/Enter key handlers only apply in Content mode — they target Quick Find rows.
        {...(mode === 'content' ? quickFindKeyHandlers(find, { escapeClears: true }) : {})}
      />
      <Segmented<SearchMode> options={MODE_OPTIONS} value={mode} onChange={setMode} />
      {mode === 'content' ? <QuickFindResults find={find} scroll /> : discoverBody}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.md,
    gap: spacing.md,
    maxWidth: layout.listMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
