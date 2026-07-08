import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';

import { useResponsive } from './use-responsive';

export interface ConfirmOptions {
  title: string;
  /** Optional body copy under the title — spell out what is lost and for whom. */
  message?: string;
  /** Confirm verb. Defaults to "Delete" when `danger`, else "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive action: the confirm button renders in the danger variant. */
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  opts: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

/**
 * Promise-based confirmation dialog — the app's single gate before destructive
 * actions (`if (await confirm({ title, danger: true })) …`). Mounted once in
 * `AppFrame`; rendered on the {@link Sheet} primitive, so it presents as a
 * centered dialog on wide screens and a bottom sheet on phones, with Esc /
 * back / backdrop all resolving `false`. Prefer a toast with "Undo" for
 * reversible actions; reserve this for the irreversible ones.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // Ref mirror so `confirm`/unmount can settle the live promise without
  // subscribing to state (keeps the context value referentially stable).
  const pendingRef = useRef<PendingConfirm | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    pendingRef.current?.resolve(confirmed);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      // A new dialog supersedes an unanswered one — the older ask was abandoned.
      pendingRef.current?.resolve(false);
      const entry: PendingConfirm = { opts, resolve };
      pendingRef.current = entry;
      setPending(entry);
    });
  }, []);

  // Never leave a caller awaiting forever if the provider unmounts mid-ask.
  useEffect(() => () => pendingRef.current?.resolve(false), []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmSheet pending={pending} onSettle={settle} />
    </ConfirmContext.Provider>
  );
}

/** The `confirm(opts) → Promise<boolean>` handle. Requires {@link ConfirmProvider}. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}

interface ConfirmSheetProps {
  pending: PendingConfirm | null;
  onSettle: (confirmed: boolean) => void;
}

function ConfirmSheet({ pending, onSettle }: ConfirmSheetProps) {
  const { isWide } = useResponsive();
  // Phone gets the real native Alert (system modal, destructive role); web and
  // wide/desktop keep the branded Sheet dialog (no native Alert on web).
  const nativeAlert = Platform.OS !== 'web' && !isWide;

  // Retain the last options so the Sheet's exit animation doesn't blank out.
  const lastOpts = useRef<ConfirmOptions | null>(null);
  useEffect(() => {
    if (pending) lastOpts.current = pending.opts;
  }, [pending]);

  // Fire the native Alert once per new pending ask; every dismissal path
  // (cancel button, destructive button, Android back) resolves the promise.
  const alertedRef = useRef<PendingConfirm | null>(null);
  useEffect(() => {
    if (!nativeAlert || !pending || alertedRef.current === pending) return;
    alertedRef.current = pending;
    const o = pending.opts;
    Alert.alert(
      o.title,
      o.message,
      [
        { text: o.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => onSettle(false) },
        {
          text: o.confirmLabel ?? (o.danger ? 'Delete' : 'Confirm'),
          style: o.danger ? 'destructive' : 'default',
          onPress: () => onSettle(true),
        },
      ],
      { cancelable: true, onDismiss: () => onSettle(false) },
    );
  }, [pending, nativeAlert, onSettle]);

  const opts = pending?.opts ?? lastOpts.current;
  if (nativeAlert || !opts) return null;

  const confirmLabel = opts.confirmLabel ?? (opts.danger ? 'Delete' : 'Confirm');
  const cancelLabel = opts.cancelLabel ?? 'Cancel';
  const confirmVariant = opts.danger ? ('danger' as const) : ('primary' as const);

  return (
    <Sheet
      visible={!!pending}
      onClose={() => onSettle(false)}
      title={opts.title}
      footer={
        isWide ? (
          // Dialog: trailing button pair, confirm in the terminal position.
          <View style={styles.footerWide}>
            <Button label={cancelLabel} variant="secondary" onPress={() => onSettle(false)} />
            <Button label={confirmLabel} variant={confirmVariant} onPress={() => onSettle(true)} />
          </View>
        ) : (
          // Bottom sheet: stacked full-width buttons, confirm on top (thumb-first).
          <View style={styles.footerNarrow}>
            <Button label={confirmLabel} variant={confirmVariant} full onPress={() => onSettle(true)} />
            <Button label={cancelLabel} variant="secondary" full onPress={() => onSettle(false)} />
          </View>
        )
      }
    >
      {opts.message ? (
        <Txt variant="body" tone="inkSoft">
          {opts.message}
        </Txt>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footerWide: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  footerNarrow: {
    gap: spacing.sm,
  },
});
