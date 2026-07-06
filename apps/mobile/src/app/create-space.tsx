import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';
import { humanizeError } from '@drakkar.software/octovault-sdk';
import { captureException } from '@/lib/analytics';
import { useSession } from '@/lib/session-context';
import { useSpaces } from '@/lib/use-spaces';
import { AppBar } from '@/components/ui/AppBar';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SignInPrompt } from '@/components/ui/SignInPrompt';
import { StackScreen } from '@/components/ui/StackScreen';
import { TextField } from '@/components/ui/TextField';
import { AuthScreen } from '@/components/onboarding/AuthScreen';

/**
 * Creating a space — its own screen (reached from the space switcher / rail "+"
 * and the foot of /join), split out of the old three-cards-in-one join screen so
 * each job reads on its own.
 *
 * Per-node access model: spaces are always private; public/invite visibility is set
 * per-node at creation time (not on the space). The pubspace toggle is gone.
 */
export default function CreateSpaceScreen() {
  const { session } = useSession();
  const { createSpace, setActiveId } = useSpaces();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/work'));

  if (!session) {
    return (
      <StackScreen header={<AppBar title="Create a space" onBack={goBack} />}>
        <SignInPrompt subtitle="Create an identity to start a space." />
      </StackScreen>
    );
  }

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const space = await createSpace(name);
      if (!space) throw new Error('Could not create the space.');
      // Land directly inside the new space's vault.
      setActiveId(space.id);
      router.replace('/(tabs)/work');
    } catch (e) {
      captureException(e);
      setError(humanizeError(e, "Couldn't create the space. Try again."));
      setBusy(false);
    }
  };

  return (
    <AuthScreen trust={false} header={<AppBar title="Create a space" onBack={goBack} />}>
      <View style={styles.field}>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="e.g. Research, Family, Side project…"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          onSubmitEditing={create}
          returnKeyType="go"
        />
      </View>

      <Button
        label={busy ? 'Creating…' : 'Create space'}
        variant="primary"
        size="lg"
        full
        loading={busy}
        disabled={busy || !name.trim()}
        onPress={create}
      />

      {error ? (
        <Callout tone="danger" iconName="alert">
          {error}
        </Callout>
      ) : null}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
});
