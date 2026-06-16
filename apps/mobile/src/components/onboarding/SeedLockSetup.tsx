import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing, type as typeScale } from '@/theme';
import { humanizeError } from '@drakkar.software/octovault-sdk';
import { usePinKeys } from '@/lib/use-pin-keys';
import { enrollPasskey } from '@drakkar.software/octovault-sdk/platform';
import type { SeedLock } from '@drakkar.software/octovault-sdk';
import { activeVariant } from '@/lib/variants';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Txt } from '@/components/ui/Txt';

import { PinDots } from './PinDots';
import { PinPad } from './PinPad';

const PIN_LENGTH = 6;

interface SeedLockSetupProps {
  /** Whether a passkey can be enrolled in this browser. */
  passkeyAvailable: boolean;
  /** Derive + seal + persist the identity with the chosen lock (heavy: Argon2id). */
  onSubmit: (lock: SeedLock) => Promise<void>;
  /** Called once a submit succeeds — navigate into the app. */
  onDone: () => void;
}

type Stage = 'enter' | 'confirm' | 'passkey';

/**
 * Sets the lock for the web-persisted seed: pick a 6-digit PIN (entered twice),
 * then optionally enroll a passkey. The seed is sealed behind whatever is chosen
 * and only then written to disk. Fully keyboard-operable on web (digits,
 * Backspace, paste — see `usePinKeys`); a mismatch shakes the dots instead of
 * shifting the layout with an inserted banner.
 */
export function SeedLockSetup({ passkeyAvailable, onSubmit, onDone }: SeedLockSetupProps) {
  const [stage, setStage] = useState<Stage>('enter');
  const [pin, setPin] = useState(''); // first entry, retained once confirmed
  const [entry, setEntry] = useState(''); // current pad buffer
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  const submit = async (lock: SeedLock) => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(lock);
      onDone();
    } catch (e) {
      setError(humanizeError(e, 'Couldn’t secure your vault. Try again.'));
      setBusy(false);
    }
  };

  // Enroll on this fresh tap (WebAuthn needs a user gesture) BEFORE the heavy
  // Argon2id seal in onSubmit, otherwise the activation can expire mid-derivation.
  const addPasskey = async () => {
    setBusy(true);
    setError(null);
    try {
      const passkey = await enrollPasskey(activeVariant.appName);
      await submit({ pin, passkey }); // submit owns its own error/busy handling
    } catch (e) {
      setError(humanizeError(e, 'Couldn’t add the passkey. Try again or use PIN only.'));
      setBusy(false);
    }
  };

  const onDigit = (d: string) => {
    if (busy || entry.length >= PIN_LENGTH) return;
    const next = entry + d;
    if (next.length < PIN_LENGTH) {
      setEntry(next);
      return;
    }
    if (stage === 'enter') {
      setPin(next);
      setEntry('');
      setStage('confirm');
      return;
    }
    // stage === 'confirm'
    if (next !== pin) {
      setError('PINs didn’t match — start again.');
      setShake((k) => k + 1);
      setPin('');
      setEntry('');
      setStage('enter');
      return;
    }
    setEntry('');
    if (passkeyAvailable) {
      setStage('passkey');
      return;
    }
    void submit({ pin: next });
  };

  const onDelete = () => setEntry((c) => c.slice(0, -1));

  // The hardware keyboard mirrors the on-screen pad (web only). Hooks before the
  // passkey-stage early return; `enabled` keeps it quiet there and mid-derive.
  usePinKeys({ onDigit, onDelete, enabled: stage !== 'passkey' && !busy });

  if (stage === 'passkey') {
    return (
      <View style={styles.block}>
        <Callout tone="accent" iconName="shield" title="Add a passkey?">
          A passkey (Touch ID, Windows Hello or a security key) unlocks faster and
          can&apos;t be brute-forced like a 6-digit PIN. Recommended. You may be
          prompted twice to register it.
        </Callout>
        {error ? (
          <Callout tone="danger" iconName="alert">
            {error}
          </Callout>
        ) : null}
        <View style={styles.actions}>
          <Button
            label={busy ? 'Securing…' : 'Add a passkey'}
            variant="primary"
            size="lg"
            full
            iconName="key"
            loading={busy}
            disabled={busy}
            onPress={() => void addPasskey()}
          />
          <Button
            label="Use PIN only"
            variant="ghost"
            size="md"
            full
            disabled={busy}
            onPress={() => void submit({ pin })}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Callout tone="accent" iconName="shield">
        Your recovery seed is encrypted with this PIN before it&apos;s saved on this
        device. You&apos;ll enter it each time you open {activeVariant.appName} here.
      </Callout>

      <View style={styles.pinBlock}>
        <Txt variant="caption" weight="semibold" mono uppercase tone="inkSoft" center>
          {stage === 'enter' ? 'Create a PIN' : 'Re-enter PIN'}
        </Txt>
        <PinDots length={PIN_LENGTH} filled={entry.length} shake={shake} />
        {/* Reserved slot: errors appear here without pushing the pad downward. */}
        <View style={styles.errorSlot}>
          {error ? (
            <Txt variant="footnote" tone="danger" center>
              {error}
            </Txt>
          ) : null}
        </View>
      </View>

      <PinPad onDigit={onDigit} onDelete={onDelete} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.lg },
  pinBlock: { gap: spacing.md },
  actions: { gap: spacing.md },
  // Two footnote lines reserved so a long error wraps without layout shift.
  errorSlot: { minHeight: typeScale.footnote.lineHeight * 2, justifyContent: 'center' },
});
