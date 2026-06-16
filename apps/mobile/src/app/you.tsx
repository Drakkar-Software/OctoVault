import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { layout, spacing } from '@/theme';
import { useProfileAutosave } from '@/lib/use-profile-autosave';
import { useInShell } from '@/lib/use-responsive';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/use-theme';
import { useBrand } from '@/lib/brand-context';
import { VARIANTS, type VariantId } from '@/lib/variants';
import { AccountSwitcher } from '@/components/account/AccountSwitcher';
import { AppLockRow } from '@/components/settings/AppLockRow';
import { AiSettingsCard } from '@/components/settings/AiSettingsCard';
import { DebugStatsCard } from '@/components/settings/DebugStatsCard';
import { NotificationSettingsCard } from '@/components/settings/NotificationSettingsCard';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { UpdateSettingsCard } from '@/components/settings/UpdateSettingsCard';
import { AppBar } from '@/components/ui/AppBar';
import { AutosaveField } from '@/components/ui/AutosaveField';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/Divider';
import { Icon } from '@/components/ui/Icon';
import { Row } from '@/components/ui/Row';
import { SignInPrompt } from '@/components/ui/SignInPrompt';
import { StackScreen } from '@/components/ui/StackScreen';
import { Txt } from '@/components/ui/Txt';

const VARIANT_IDS = Object.keys(VARIANTS) as VariantId[];

/** Card letting the user switch the active sub-app variant (OctoVault, OctoNotes, …). */
function AppVariantCard() {
  const { colors } = useTheme();
  const { variant, setVariant } = useBrand();
  return (
    <Card title="APP">
      {VARIANT_IDS.map((id, i) => {
        const v = VARIANTS[id];
        const active = variant.id === id;
        return (
          <View key={id}>
            {i > 0 ? <Divider style={styles.divider} /> : null}
            <Row
              title={v.appName}
              detail={v.features.join(', ')}
              right={
                active ? (
                  <Icon name="check" size={16} color={colors.accent} />
                ) : undefined
              }
              onPress={active ? undefined : () => setVariant(id)}
            />
          </View>
        );
      })}
    </Card>
  );
}

/**
 * Account settings, grouped into three sections (Identity / Preferences / This
 * device) on the shared settings reading column. Edits autosave like everywhere
 * else in the app (no dirty-tracked Save button).
 */
export default function YouScreen() {
  const { colors } = useTheme();
  const inShell = useInShell();
  const { fullSignOut, accounts, activeBootstrapOrigin } = useSession();
  const nostrPubHex = activeBootstrapOrigin?.kind === 'secp256k1' ? activeBootstrapOrigin.pubHex : null;
  const { profile, loading, saving, commitName, pickAvatar, removeAvatar, avatarDraft, avatarError } =
    useProfileAutosave();

  // Pushed from the mobile Vault header / space switcher — needs a back action;
  // on the desktop shell it sits in the main pane, where the sidebar is the nav.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/work'));

  if (!profile) {
    return (
      <StackScreen header={<AppBar title="Profile" onBack={inShell ? undefined : goBack} />}>
        <SignInPrompt subtitle="Create an identity to view your profile." />
      </StackScreen>
    );
  }

  const initials = profile.name.slice(0, 2).toUpperCase();

  return (
    <StackScreen
      scroll
      contentStyle={styles.content}
      header={
        <AppBar
          title="Profile"
          onBack={inShell ? undefined : goBack}
          right={
            // Quiet autosave status — replaces the dirty-tracked manual Save.
            saving ? (
              <Txt variant="caption" mono tone="inkMuted">
                Saving…
              </Txt>
            ) : undefined
          }
        />
      }
    >
      {/* Identity hero: avatar + name + handle */}
      <View style={styles.identity}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          onPress={() => void pickAvatar()}
          style={styles.avatarWrap}
        >
          <Avatar label={initials} image={avatarDraft} size={68} />
          <View
            style={[
              styles.cameraBadge,
              {
                width: layout.avatarBadgeSize,
                height: layout.avatarBadgeSize,
                borderRadius: layout.avatarBadgeSize / 2,
                backgroundColor: colors.accent,
                borderColor: colors.paper,
              },
            ]}
          >
            <Icon name="camera" size={12} color={colors.onAccent} />
          </View>
        </Pressable>
        <View style={styles.identityText}>
          <Txt variant="heading" weight="bold">
            {profile.name}
          </Txt>
          <Txt variant="footnote" mono tone="inkMuted">
            {profile.handle}
          </Txt>
          <View style={styles.avatarActions}>
            <Pressable accessibilityRole="button" onPress={() => void pickAvatar()} hitSlop={6}>
              <Txt variant="footnote" weight="semibold" tone="accent">
                {avatarDraft ? 'Change photo' : 'Upload photo'}
              </Txt>
            </Pressable>
            {avatarDraft ? (
              <Pressable accessibilityRole="button" onPress={removeAvatar} hitSlop={6}>
                <Txt variant="footnote" weight="semibold" tone="danger">
                  Remove
                </Txt>
              </Pressable>
            ) : null}
          </View>
          {avatarError ? (
            <Txt variant="micro" tone="danger">
              {avatarError}
            </Txt>
          ) : null}
        </View>
      </View>

      {/* ── Identity ──────────────────────────────────────────── */}
      <SettingsSection title="Identity">
        <Card title="ABOUT">
          <View style={styles.field}>
            <Txt variant="micro" weight="semibold" mono uppercase tone="inkMuted">
              Display name
            </Txt>
            {/* Seed-once inline editor: mount only after the persisted pseudo has
                loaded (the field reads `initialText` exactly once), keyed per
                account so switching identities re-seeds it. */}
            {!loading ? (
              <AutosaveField
                key={profile.userId}
                initialText={profile.name}
                onCommit={(text) => commitName(text)}
                autoFocus={false}
                placeholder="Your display name"
                accessibilityLabel="Display name"
              />
            ) : null}
          </View>
        </Card>

        <Card title="ACCOUNTS">
          <AccountSwitcher />
        </Card>

        <Card title="SECURITY">
          {nostrPubHex ? (
            <Row
              iconName="key"
              title="Linked to Nostr"
              detail={`${nostrPubHex.slice(0, 8)}…${nostrPubHex.slice(-8)} · sign in with the same extension`}
              detailMono
            />
          ) : (
            <Row
              iconName="shield"
              title="Recovery seed"
              detail="12 words · view or back up"
              onPress={() => router.push('/account/backup')}
            />
          )}
          <Divider style={styles.divider} />
          <Row
            iconName="devices"
            title="Add a device"
            detail="One-time transfer PIN + QR"
            onPress={() => router.push('/account/add-device')}
          />
          <AppLockRow />
        </Card>
      </SettingsSection>

      {/* ── Preferences ───────────────────────────────────────── */}
      <SettingsSection title="Preferences">
        <AiSettingsCard />
        <NotificationSettingsCard />
        <AppVariantCard />
      </SettingsSection>

      {/* ── This device ───────────────────────────────────────── */}
      <SettingsSection title="This device">
        <UpdateSettingsCard />
        <DebugStatsCard />
      </SettingsSection>

      {accounts.length > 1 ? (
        <Button
          label="Sign out of all accounts"
          variant="ghost"
          size="md"
          iconName="logout"
          onPress={async () => {
            await fullSignOut();
            router.replace('/(onboarding)/welcome');
          }}
        />
      ) : null}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.screenX,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
    maxWidth: layout.settingsColumnWidth,
    width: '100%',
    alignSelf: 'center',
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatarWrap: { position: 'relative' },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: 2 },
  avatarActions: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  field: { gap: 3 },
  divider: { marginVertical: spacing.xs },
});
