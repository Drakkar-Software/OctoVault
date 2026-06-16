import { useEffect, useMemo, useRef, useState } from 'react';
import { router, type Href } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { layout, spacing } from '@/theme';
import { activeVariant } from '@/lib/variants';
import { humanizeError } from '@drakkar.software/octovault-sdk';
import { previewInvite, type InvitePreview } from '@drakkar.software/octovault-sdk';
import { acceptSpaceInvite, joinSpaceByLink, joinNodeByLink, makeJoinRequest } from '@drakkar.software/octovault-sdk';
import { useInviteFragment } from '@/lib/use-invite-link';
import { useSession } from '@/lib/session-context';
import { useSpaces } from '@/lib/use-spaces';
import { useTheme } from '@/lib/use-theme';
import { AppBar } from '@/components/ui/AppBar';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { CopyField } from '@/components/ui/CopyField';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Row } from '@/components/ui/Row';
import { SignInPrompt } from '@/components/ui/SignInPrompt';
import { StackScreen } from '@/components/ui/StackScreen';
import { TextField } from '@/components/ui/TextField';
import { Txt } from '@/components/ui/Txt';
import { QrCode } from '@/components/onboarding/QrCode';
import { QrScanner } from '@/components/onboarding/QrScanner';

/**
 * Joining a space — and ONLY joining. Creating one moved to its own route
 * (`/create-space`), and every invite (deep link, paste or scan) now lands on a
 * consent card naming the space before anything is joined: opening a link used
 * to silently add the space and teleport into it.
 */
export default function JoinScreen() {
  const { colors } = useTheme();
  const { session } = useSession();
  const { setActiveId } = useSpaces();
  const inviteFrag = useInviteFragment();
  // The last fragment we previewed. Native re-delivers the same launch URL on
  // remount (there's no address bar to clear, unlike web's `replaceState`), so
  // this guards a given credential to a single consent card.
  const consumed = useRef<string | null>(null);
  const myRequest = useMemo(() => (session ? makeJoinRequest(session) : ''), [session]);
  const [invite, setInvite] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Native-only: scan a public-space invitation QR with the camera. The web
  // platform has no QrScanner (the shim returns null), so the button is hidden.
  const canScan = Platform.OS !== 'web';
  const [scanning, setScanning] = useState(false);

  // Opening an invitation link (`…/join#<token>`) STAGES a consent card — never
  // a silent join. Waits for a session (SignInPrompt gates below and unlocking in
  // place keeps the URL + fragment intact), decodes locally, then clears the
  // credential from the web address bar so a refresh can't re-trigger it.
  useEffect(() => {
    if (!inviteFrag || inviteFrag === '#' || !session) return;
    if (consumed.current === inviteFrag) return;
    consumed.current = inviteFrag;
    try {
      setPreview(previewInvite(inviteFrag));
      setError(null);
    } catch (e) {
      setError(humanizeError(e));
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [session, inviteFrag]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/work'));

  if (!session) {
    return (
      <StackScreen header={<AppBar title="Join a space" onBack={goBack} />}>
        <SignInPrompt subtitle="Create an identity to join or create spaces." />
      </StackScreen>
    );
  }

  // Make the just-joined space active and land on its Vault workspace.
  const enterSpace = (spaceId: string) => {
    setActiveId(spaceId);
    router.replace('/(tabs)/work');
  };

  /** Parse pasted/scanned text into the consent preview (no join yet). */
  const review = (raw: string) => {
    setError(null);
    try {
      setPreview(previewInvite(raw));
    } catch (e) {
      setError(humanizeError(e));
    }
  };

  /** The consent card's Join — the only place a join actually happens. */
  const joinNow = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      let spaceId: string;
      if (preview.kind === 'space-link') {
        const space = await joinSpaceByLink(session, preview.token);
        spaceId = space.id;
      } else if (preview.kind === 'node-link') {
        await joinNodeByLink(session, preview.token);
        spaceId = preview.token.spaceId;
      } else {
        const space = await acceptSpaceInvite(session, preview.inviteJson);
        spaceId = space.id;
      }
      enterSpace(spaceId);
    } catch (e) {
      setError(humanizeError(e, "Couldn't join the space. Try again."));
      setBusy(false);
    }
  };

  const dismissPreview = () => {
    setPreview(null);
    setError(null);
    setBusy(false);
  };

  // ── Consent card: "You're invited to <space> — join?" ─────────────────────
  if (preview) {
    return (
      <StackScreen scroll contentStyle={styles.content} header={<AppBar title="Join a space" onBack={dismissPreview} />}>
        <Card style={styles.consent}>
          <Txt variant="micro" weight="semibold" mono uppercase tone="inkMuted" center>
            You're invited to
          </Txt>
          <Txt variant="display" center>
            {preview.spaceName}
          </Txt>
          <View style={styles.consentMeta}>
            {preview.kind === 'member-bundle' ? (
              <Pill tone="accent" label="PRIVATE · E2EE" mono />
            ) : preview.kind === 'space-link' ? (
              <Pill tone="note" label={preview.write ? 'SPACE LINK · READ & WRITE' : 'SPACE LINK · READ-ONLY'} mono />
            ) : (
              <Pill tone="note" label="NODE INVITE" mono />
            )}
          </View>
          {preview.kind === 'member-bundle' ? (
            <View style={styles.consentDetail}>
              <Txt variant="caption" mono tone="inkMuted" center>
                space {preview.spaceId.slice(0, 6)}…{preview.spaceId.slice(-6)}
              </Txt>
              {preview.issuerKey ? (
                <Txt variant="caption" mono tone="inkMuted" center>
                  invited by key {preview.issuerKey}
                </Txt>
              ) : null}
            </View>
          ) : null}
          {error ? (
            <Callout tone="danger" iconName="alert">
              {error}
            </Callout>
          ) : null}
          <View style={styles.consentActions}>
            <Button
              label={busy ? 'Joining…' : 'Join space'}
              variant="primary"
              size="lg"
              full
              loading={busy}
              disabled={busy}
              onPress={() => void joinNow()}
            />
            <Button label="Not now" variant="ghost" size="md" full disabled={busy} onPress={dismissPreview} />
          </View>
        </Card>
      </StackScreen>
    );
  }

  // ── Default: paste/scan an invite + the stepped private-space exchange ────
  return (
    <StackScreen scroll contentStyle={styles.content} header={<AppBar title="Join a space" onBack={goBack} />}>
      <Card title="HAVE AN INVITE?">
        <Txt variant="footnote" tone="inkSoft">
          Paste a private invite, or a public space's invitation link. You'll see the space's
          name before anything is joined.
        </Txt>
        <TextField
          value={invite}
          onChangeText={setInvite}
          placeholder="Paste invite or link…"
          multiline
          mono
          autoCapitalize="none"
          autoCorrect={false}
        />
        {scanning ? (
          <QrScanner
            onScan={(data) => {
              setScanning(false);
              setInvite(data);
              review(data);
            }}
          />
        ) : null}
        <View style={styles.actionRow}>
          <Button
            label="Review invite"
            variant="primary"
            size="md"
            style={styles.actionBtn}
            disabled={!invite.trim()}
            onPress={() => review(invite)}
          />
          {canScan ? (
            <Button
              label={scanning ? 'Cancel scan' : 'Scan invite'}
              variant="secondary"
              size="md"
              iconName={scanning ? 'x' : 'qr-scan'}
              style={styles.actionBtn}
              onPress={() => setScanning((s) => !s)}
            />
          ) : null}
        </View>
        {error ? (
          <Callout tone="danger" iconName="alert">
            {error}
          </Callout>
        ) : null}
      </Card>

      <Card title="NEED ONE? · PRIVATE SPACES">
        <View style={styles.stepRow}>
          <StepBadge n={1} />
          <Txt variant="footnote" tone="inkSoft" style={styles.stepText}>
            Send your join request to the space's owner — it holds your public keys, nothing secret.
          </Txt>
        </View>
        <CopyField value={myRequest} copyLabel="Copy join request" share shareTitle={`My ${activeVariant.appName} join request`} />
        {Platform.OS !== 'web' ? (
          // In-person exchange: the owner can scan this instead of receiving a paste.
          <View style={styles.qrWrap}>
            <QrCode size={180} value={myRequest} hideMark ecl="L" />
          </View>
        ) : null}
        <View style={styles.stepRow}>
          <StepBadge n={2} />
          <Txt variant="footnote" tone="inkSoft" style={styles.stepText}>
            They send back an invite — paste it above to review and join.
          </Txt>
        </View>
      </Card>

      <View style={styles.createRow}>
        <Row
          iconName="plus"
          iconColor={colors.accent}
          title="Create a space instead"
          detail="Start a private (E2EE) or public space you own"
          // Cast: app/create-space.tsx exists, but expo-router's GENERATED route
          // union (.expo/types) only refreshes on the next dev-server cycle.
          onPress={() => router.push('/create-space' as Href)}
          right={<Icon name="chev" size={16} color={colors.inkMuted} />}
        />
      </View>
    </StackScreen>
  );
}

/** Small numbered disc for the two-step private exchange. */
function StepBadge({ n }: { n: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stepBadge, { backgroundColor: colors.accentBg }]}>
      <Txt variant="micro" mono weight="semibold" color={colors.accentInk}>
        {n}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.screenX,
    gap: spacing.lg,
    maxWidth: layout.settingsColumnWidth,
    width: '100%',
    alignSelf: 'center',
  },
  consent: { gap: spacing.md },
  consentMeta: { alignItems: 'center' },
  consentDetail: { gap: spacing.xs },
  consentActions: { gap: spacing.sm, marginTop: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepText: { flex: 1 },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrWrap: { alignItems: 'center' },
  createRow: { paddingHorizontal: spacing.sm },
});
