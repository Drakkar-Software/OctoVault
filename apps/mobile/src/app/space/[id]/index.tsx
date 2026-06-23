import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { layout, motion, radii, spacing } from '@/theme';
import { activeVariant } from '@/lib/variants';
import { leaveSpace } from '@drakkar.software/octovault-sdk';
import { useConfirm } from '@/lib/use-confirm';
import { useSession } from '@/lib/session-context';
import { useInShell } from '@/lib/use-responsive';
import { useSpaceDetails } from '@/lib/use-space-details';
import { useSpaceInvite } from '@/lib/use-space-invite';
import { useSpaceMembers, type SpaceMember } from '@/lib/use-space-members';
import { useSpaces } from '@/lib/use-spaces';
import { useTheme } from '@/lib/use-theme';
import { AppBar } from '@/components/ui/AppBar';
import { AutosaveField } from '@/components/ui/AutosaveField';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { CopyField } from '@/components/ui/CopyField';
import { Divider } from '@/components/ui/Divider';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Pill } from '@/components/ui/Pill';
import { SignInPrompt } from '@/components/ui/SignInPrompt';
import { Skeleton } from '@/components/ui/Skeleton';
import { StackScreen } from '@/components/ui/StackScreen';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { Txt } from '@/components/ui/Txt';

/** Space settings — one deep-linkable route, composed as a settings column
 *  (GENERAL / MEMBERS / INVITE / DANGER ZONE) on {@link layout.settingsColumnWidth}.
 *  Name and image autosave (no Save button — see use-space-details); ownership
 *  resolves async, so the owner-gated sections hold skeletons instead of popping
 *  in. Destructive actions (remove member, leave) gate through useConfirm and
 *  surface failures via toast — nothing fails silently. All logic lives in the
 *  `use-space-*` hooks; this page reads the param, pulls them, and composes UI. */
export default function SpaceDetailsScreen() {
  // The member roster resolves names/avatars from a STABLE id set through a module
  // cache the React Compiler can't track — opt out so a fetched profile reaches the
  // rows (see use-space-members.ts / use-pseudos.ts).
  'use no memo';
  const { colors } = useTheme();
  const inShell = useInShell();
  const { session } = useSession();
  const confirm = useConfirm();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const spaceId = id ?? '';

  const details = useSpaceDetails(spaceId);
  const members = useSpaceMembers(spaceId);
  const invite = useSpaceInvite(spaceId);
  const { spaces, activeId, setActiveId, refresh } = useSpaces();

  // Local UI state (page-thin: just inputs, like join.tsx).
  const [joinRequest, setJoinRequest] = useState('');
  const [leaving, setLeaving] = useState(false);
  // Bumped on blur so the autosave name field re-seeds from the persisted name —
  // an abandoned edit (emptied / whitespace-only, never committed) snaps back.
  const [nameSeed, setNameSeed] = useState(0);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/work'));
  const spaceName = details.space?.name ?? 'Space';

  const doLeave = async () => {
    if (!session || leaving) return;
    const ok = await confirm({
      title: 'Leave this space?',
      message: details.isOwner
        ? 'It disappears from your devices, but members keep their access — the space itself is not deleted. You can rejoin with an invite later.'
        : 'It disappears from your devices. You can rejoin with a new invite later.',
      confirmLabel: 'Leave space',
      danger: true,
    });
    if (!ok) return;
    setLeaving(true);
    try {
      await leaveSpace(session.spacesRegistryClient, session, spaceId);
      // Land somewhere real: the active space if it survives, else the first
      // remaining one — /join only when this was the LAST space.
      const remaining = spaces.filter((s) => s.id !== spaceId);
      const next = remaining.find((s) => s.id === activeId) ?? remaining[0] ?? null;
      setActiveId(next?.id ?? null);
      void refresh().catch(() => {});
      router.replace(next ? '/(tabs)/work' : '/join');
      toast.show({ message: `Left ${spaceName}` });
    } catch {
      setLeaving(false);
      toast.show({ message: 'Could not leave the space — check your connection and try again.', tone: 'danger' });
    }
  };

  const confirmRemoveMember = async (member: SpaceMember) => {
    const who = member.name ?? member.fingerprint;
    const ok = await confirm({
      title: `Remove ${who}?`,
      message: 'They lose access to new content. History they already decrypted may remain readable.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await members.removeMember(member.userId);
      toast.show({ message: `Removed ${who}` });
    } catch {
      toast.show({ message: 'Could not remove that member — try again.', tone: 'danger' });
    }
  };

  if (!session) {
    return (
      <StackScreen header={<AppBar title="Space settings" onBack={inShell ? undefined : goBack} />}>
        <SignInPrompt subtitle="Sign in to manage this space." />
      </StackScreen>
    );
  }

  const monogram = (details.space?.short || spaceName.slice(0, 2)).toUpperCase();

  return (
    <StackScreen
      scroll
      contentStyle={styles.content}
      header={<AppBar title="Space settings" onBack={inShell ? undefined : goBack} />}
    >
      {/* IDENTITY — the shared face of the space (avatar tap = change image). */}
      <View style={styles.identity}>
        {details.isOwner ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change space image"
            onPress={() => void details.pickImage()}
            style={styles.avatarWrap}
          >
            <Avatar label={monogram} image={details.image} size={68} />
            <View style={[styles.cameraBadge, { backgroundColor: colors.accent, borderColor: colors.paper }]}>
              <Icon name="camera" size={12} color={colors.onAccent} />
            </View>
          </Pressable>
        ) : (
          <Avatar label={monogram} image={details.image} size={68} />
        )}
        <View style={styles.identityText}>
          <Txt variant="heading" weight="bold" numberOfLines={1}>
            {spaceName}
          </Txt>
          <View style={styles.pills}>
            <Pill label="Private" tone="accent" iconName="lock" />
            {/* Role resolves async — hold a chip-shaped skeleton so the row doesn't reflow. */}
            {details.loading ? (
              <Skeleton width={72} height={20} radius={radii.pill} />
            ) : (
              <Pill label={details.isOwner ? 'Owner' : 'Member'} tone={details.isOwner ? 'success' : 'neutral'} iconName="shield" />
            )}
          </View>
          {details.isOwner ? (
            <View style={styles.avatarActions}>
              <Button
                label={details.image ? 'Change image' : 'Upload image'}
                variant="ghost"
                size="sm"
                iconName="camera"
                onPress={() => void details.pickImage()}
              />
              {details.image ? (
                <Button label="Remove" variant="ghost" size="sm" onPress={() => void details.removeImage()} />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* GENERAL — the space name autosaves (debounced while typing, flushed on blur). */}
      <Card title="GENERAL">
        {details.loading ? (
          <View style={styles.field}>
            <Skeleton width={96} height={10} />
            <Skeleton height={spacing.controlMinHeight} radius={radii.md} />
          </View>
        ) : details.isOwner ? (
          <View style={styles.field}>
            <View style={styles.fieldLabelRow}>
              <Txt variant="micro" weight="semibold" mono uppercase tone="inkMuted">
                Space name
              </Txt>
              {details.saving ? (
                <Txt variant="micro" mono tone="inkMuted">
                  Saving…
                </Txt>
              ) : null}
            </View>
            <AutosaveField
              key={`space-name-${nameSeed}`}
              initialText={details.name}
              onCommit={(text) => void details.commitName(text)}
              onClose={() => setNameSeed((n) => n + 1)}
              debounceMs={motion.autosaveLog}
              autoFocus={false}
              placeholder="Space name…"
              accessibilityLabel="Space name"
            />
            <Txt variant="caption" tone="inkMuted">
              Changes save automatically and sync to every member.
            </Txt>
          </View>
        ) : (
          <Txt variant="footnote" tone="inkSoft">
            Only the owner can change this space’s name and image.
          </Txt>
        )}
        {details.error ? (
          <Callout tone="danger" iconName="alert">
            {details.error}
          </Callout>
        ) : null}
      </Card>

      {/* MEMBERS */}
      <Card title="MEMBERS">
        {members.loading ? (
          // Roster shape while the access record loads — same row metrics as the
          // real list so the card doesn't grow when members land.
          [0, 1, 2].map((i) => (
            <View key={i} style={styles.memberRow}>
              <Skeleton width={32} height={32} radius={radii.pill} />
              <View style={styles.memberText}>
                <Skeleton width="40%" height={12} />
                <Skeleton width="55%" height={9} />
              </View>
            </View>
          ))
        ) : members.members.length === 0 ? (
          <Txt variant="footnote" tone="inkSoft">
            No members yet.
          </Txt>
        ) : (
          members.members.map((m, i) => (
            <View key={m.userId}>
              {i > 0 ? <Divider style={styles.divider} /> : null}
              <View style={styles.memberRow}>
                <Avatar label={m.monogram} image={m.avatar} size={32} />
                <View style={styles.memberText}>
                  {/* Skeleton until the profile cache resolves — never flash a raw
                      fingerprint as someone's name on first paint. */}
                  {m.resolving ? (
                    <Skeleton width="40%" height={12} />
                  ) : (
                    <Txt variant="callout" weight="semibold" numberOfLines={1}>
                      {m.name ?? m.fingerprint}
                    </Txt>
                  )}
                  <Txt variant="caption" tone="inkMuted" mono numberOfLines={1}>
                    {m.isOwner ? `Owner · ${m.fingerprint}` : m.fingerprint}
                  </Txt>
                </View>
                {details.isOwner && !m.isOwner ? (
                  <IconButton
                    name="x"
                    size={16}
                    color={colors.inkMuted}
                    tooltip="Remove member"
                    accessibilityLabel={`Remove ${m.name ?? m.fingerprint}`}
                    onPress={() => void confirmRemoveMember(m)}
                  />
                ) : null}
              </View>
            </View>
          ))
        )}
      </Card>

      {/* INVITE — owner only; skeleton while ownership resolves so it doesn't pop in. */}
      {details.loading ? (
        <Card title="INVITE">
          <Skeleton width="85%" height={12} />
          <Skeleton width="55%" height={12} />
          <Skeleton height={spacing.controlMinHeight} radius={radii.md} />
        </Card>
      ) : details.isOwner ? (
        <Card title="INVITE">
          <Txt variant="footnote" tone="inkSoft">
            Paste the invitee’s join request (from their Join screen), then generate an encrypted invite cap to send back.
          </Txt>
          <TextField
            value={joinRequest}
            onChangeText={(v) => {
              setJoinRequest(v);
              if (invite.result) invite.reset();
            }}
            placeholder="Paste join request…"
            multiline
            mono
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            label={invite.busy ? 'Generating…' : 'Generate invite'}
            variant="secondary"
            size="md"
            iconName="people"
            loading={invite.busy}
            onPress={() => void invite.generatePrivateInvite(joinRequest)}
          />
          {invite.result ? (
            <CopyField
              value={invite.result}
              label="Invite cap"
              copyLabel="Copy invite"
              share
              shareTitle={`Join ${spaceName} on ${activeVariant.appName}`}
            />
          ) : null}
          {invite.error ? (
            <Callout tone="danger" iconName="alert">
              {invite.error}
            </Callout>
          ) : null}
        </Card>
      ) : null}

      {/* TYPES — owner-only; custom object types for this space. */}
      {details.isOwner ? (
        <Card title="TYPES">
          <Txt variant="footnote" tone="inkSoft">
            Define custom object types with their own fields and icon — boards, trackers, databases, anything.
          </Txt>
          <Button
            label="Manage types"
            variant="secondary"
            size="md"
            iconName="layers"
            onPress={() => router.push({ pathname: '/space/[id]/types', params: { id: spaceId } })}
          />
        </Card>
      ) : null}

      {/* DANGER ZONE — leaving gates through the app-wide confirm dialog. */}
      <Card title="DANGER ZONE">
        <Txt variant="footnote" tone="inkSoft">
          {details.isOwner
            ? 'Leaving removes this space from your devices. Members keep their access — this does not delete the space.'
            : 'Leaving removes this space from your devices. You can rejoin with a new invite later.'}
        </Txt>
        <Button
          label={leaving ? 'Leaving…' : 'Leave space'}
          variant="danger"
          size="md"
          iconName="logout"
          disabled={leaving}
          onPress={() => void doLeave()}
        />
      </Card>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.screenX,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
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
    width: layout.avatarBadgeSize,
    height: layout.avatarBadgeSize,
    borderRadius: layout.avatarBadgeSize / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: spacing.xs },
  pills: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  avatarActions: { flexDirection: 'row', gap: spacing.xs },
  field: { gap: 3 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { marginVertical: spacing.xs },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: spacing.controlMinHeight },
  memberText: { flex: 1, gap: 2 },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
});
