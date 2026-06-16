import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';
import { useCreatableTypes } from '@/lib/use-creatable-types';
import type { ObjectType } from '@drakkar.software/octovault-sdk';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Empty state for a space with no content yet — shown once the object index has
 * loaded and holds no pages/boards (gated on `loaded`). Buttons are driven by
 * the type registry so any new creatable workTree type appears automatically.
 */
export function WorkEmpty({ onCreate, disabled }: { onCreate: (type: ObjectType) => void; disabled?: boolean }) {
  const workTreeTypes = useCreatableTypes();
  return (
    <View style={styles.floor}>
      <EmptyState
        iconName="book"
        title="Write your first page"
        subtitle="Pages hold your notes and documents; boards track work in columns. Everything here is private to this space and syncs to all your devices."
      >
        <View style={styles.actions}>
          {workTreeTypes.map((d, i) => (
            <Button
              key={d.type}
              label={`New ${d.label.toLowerCase()}`}
              variant={i === 0 ? 'primary' : 'secondary'}
              iconName="plus"
              size="sm"
              disabled={disabled}
              onPress={() => onCreate(d.type)}
            />
          ))}
        </View>
      </EmptyState>
    </View>
  );
}

/**
 * Zero-SPACE state for the Vault tab — a brand-new identity has no space yet,
 * and the object store is disabled without one, so the create buttons above
 * would sit disabled forever ("Opening workspace…", the old dead end). This is
 * a live door instead: one CTA into the create/join flow.
 */
export function WorkNoSpaces() {
  const router = useRouter();
  return (
    <EmptyState
      iconName="lock"
      title="Create your first space"
      subtitle="A space is a private home for your pages and boards — end-to-end encrypted, shared only with people you invite."
    >
      <View style={styles.buttonWrap}>
        <Button label="Create a space" variant="primary" iconName="plus" onPress={() => router.push('/join')} />
      </View>
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  floor: { minHeight: 320 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  buttonWrap: { alignItems: 'center' },
});
