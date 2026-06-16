import { StyleSheet } from 'react-native';

import { spacing } from '@/theme';
import { useSession } from '@/lib/session-context';
import { useSpaces } from '@/lib/use-spaces';
import { AppBar } from '@/components/ui/AppBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { SignInPrompt } from '@/components/ui/SignInPrompt';
import { StackScreen } from '@/components/ui/StackScreen';
import { SpaceSwitcher } from '@/components/work/SpaceSwitcher';

/**
 * Agents bottom tab — the active space's automations. Space context comes from
 * {@link useSpaces}; the space is switched from the Vault tab and this tab follows
 * it. Mirrors the structure of OctoChat's agents screen. Agent logic is wired in a
 * later pass — for now the screen shows an empty state.
 */
export default function AgentsScreen() {
  const { session } = useSession();
  const { activeId } = useSpaces();

  return (
    <StackScreen
      inTabs
      scroll
      header={
        <AppBar
          title="Agents"
          titleNode={<SpaceSwitcher variant="appbar" />}
          right={undefined}
        />
      }
      contentStyle={styles.content}
    >
      {!session ? (
        <SignInPrompt subtitle="Create an identity to manage agents." />
      ) : (
        <EmptyState
          iconName="agents"
          title="No agents"
          subtitle={
            activeId
              ? 'Automations for this space will appear here.'
              : 'Select a space to see its automations.'
          }
        />
      )}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: 96 },
});
