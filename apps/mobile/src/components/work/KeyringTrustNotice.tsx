import { StyleSheet, View } from 'react-native';

import { radii, spacing } from '@/theme';
import { useConfirm } from '@/lib/use-confirm';
import { useTheme } from '@/lib/use-theme';
import { useTrustBypass } from '@/lib/use-trust-bypass';

import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { Icon } from '../ui/Icon';
import { Txt } from '../ui/Txt';

interface KeyringTrustNoticeProps {
  spaceId: string;
  openError: string | null;
  onRetry: () => void;
  /** Archive this node and replace it with an empty one of the same type/title
   *  — the last resort when the content itself can never be decrypted (as
   *  opposed to the trust bypass, which fixes an untrusted-adder mismatch but
   *  can't recover content sealed under a key the keyring no longer holds). */
  onRecreate: () => void;
}

/**
 * Renders the existing danger Callout for an `openError`, plus — once, per
 * space, until the user acts — a companion recovery card offering the
 * "Trust this space & retry" bypass (see `use-trust-bypass.ts` /
 * `buildEncryptorTofu`). Deliberately styled off the theme's `note` tokens
 * (reserved for sparing security callouts) rather than another danger/warning
 * tone, so it reads as a considered decision rather than a second alarm.
 *
 * Once a space has been trusted, this card no longer reappears for it — if
 * the open still fails after that, the plain `openError` Callout is the only
 * thing shown, since retrying the bypass again would not help.
 */
export function KeyringTrustNotice({ spaceId, openError, onRetry, onRecreate }: KeyringTrustNoticeProps) {
  const { colors } = useTheme();
  const { isBypassed, enableBypass } = useTrustBypass();
  const confirm = useConfirm();

  if (!openError) return null;
  const alreadyTrusted = isBypassed(spaceId);

  const askRecreate = async () => {
    const ok = await confirm({
      title: 'Delete this and start fresh?',
      message:
        "The old content moves to Trash, but its encryption key no longer matches — it can never be opened again. A new, empty replacement takes its place with the same name.",
      confirmLabel: 'Delete & start fresh',
      danger: true,
    });
    if (ok) onRecreate();
  };

  return (
    <View style={styles.stack}>
      <Callout tone="danger" iconName="alert">{openError}</Callout>
      {alreadyTrusted ? null : (
        <View style={[styles.notice, { backgroundColor: colors.note }]}>
          <View style={styles.heading}>
            <Icon name="key" size={18} color={colors.noteInk} />
            <Txt variant="heading" weight="semibold" color={colors.noteInk}>
              Recover this space&apos;s key
            </Txt>
          </View>
          <Txt variant="footnote" color={colors.noteInk}>
            OctoVault couldn&apos;t confirm who added your key to this space — likely left over
            from a recent update. If you own this space, trusting it will fix that.
          </Txt>
          <Button
            label="Trust this space & retry"
            variant="secondary"
            onPress={() => {
              enableBypass(spaceId);
              onRetry();
            }}
          />
          <Txt variant="footnote" color={colors.inkMuted}>
            Skips the extra verification step for this space only. Only use it for spaces you own
            or fully trust.
          </Txt>
        </View>
      )}
      <View style={styles.escapeHatch}>
        <Button label="Delete & start fresh" variant="danger" size="sm" onPress={askRecreate} />
        <Txt variant="footnote" tone="inkFaint">
          Still stuck? This content&apos;s key may be gone for good — replace it with an empty one.
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  notice: { borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  escapeHatch: { gap: spacing.xs, alignItems: 'flex-start' },
});
