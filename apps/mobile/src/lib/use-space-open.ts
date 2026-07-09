/**
 * Shared space-open state machine for merge-doc and append-only content hooks.
 * Both open a space's crypto context the same way — resolve it over the network,
 * which can fail — so they share ONE policy here for:
 *  - `opening` / `openError` / `offline` flags,
 *  - classifying a failed open: a genuine {@link SpaceAccessError} is a hard
 *    `openError` the user must see; anything else is a connectivity failure that
 *    degrades to an `offline` shell (banner + pending states still render),
 *  - correcting the global online signal from the REAL open outcome
 *    ({@link reportReachability}) so the offline banner shows even when the native
 *    SSE-proxy flag is stuck optimistic-true,
 *  - re-opening automatically when connectivity returns.
 *
 * The hook owns no crypto/network — the caller runs its own open effect and reports
 * the result via {@link SpaceOpenState.beginOpen}/`openReached`/`finishOpening`/`failOpen`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { reportReachability, subscribeOnline } from './connectivity';
import { classifyError, SpaceAccessError } from '@drakkar.software/octovault-sdk';
import type { ErrorKind } from '@drakkar.software/octovault-sdk';

export interface SpaceOpenState {
  opening: boolean;
  /** A hard, user-facing error (genuine access denial) — not connectivity. */
  openError: string | null;
  /** Why {@link openError} happened. `'crypto'` when the keyring itself refused to
   *  open (the trusted-adder mismatch), which is what unlocks the recovery UI;
   *  `'access'` for a plain denial. */
  openErrorKind: ErrorKind | null;
  /** The open couldn't reach the server: degrade to an offline shell, don't error. */
  offline: boolean;
  /** Bumped to re-run the caller's open effect (manual retry or reconnect). */
  reloadNonce: number;
  reload: () => void;
  /** Call at the START of an open attempt — resets error/offline, sets `opening`. */
  beginOpen: () => void;
  /** A network-touching open step succeeded — the server is reachable. */
  openReached: () => void;
  /** End the `opening` phase (success). Public-space opens that did no network call
   *  use this WITHOUT {@link openReached}, since they proved nothing about reachability. */
  finishOpening: () => void;
  /** Classify + record a failed open (access denial → error, else offline). */
  failOpen: (e: unknown) => void;
}

export function useSpaceOpenState(): SpaceOpenState {
  const [opening, setOpening] = useState(true);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openErrorKind, setOpenErrorKind] = useState<ErrorKind | null>(null);
  const [offline, setOffline] = useState(false);
  // Bumped by `reload()` to re-run the caller's open effect after a timeout/error
  // without leaving the screen (the rejected pull already cleared the encryptor cache).
  const [reloadNonce, setReloadNonce] = useState(0);
  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  // Re-open automatically when connectivity returns, but only if we degraded offline
  // (so a normal online edge doesn't churn a healthy open). A ref keeps the subscriber
  // stable while reading the latest `offline`.
  const offlineRef = useRef(false);
  offlineRef.current = offline;
  useEffect(() => subscribeOnline((on) => { if (on && offlineRef.current) reload(); }), [reload]);

  const beginOpen = useCallback(() => {
    setOpenError(null);
    setOpenErrorKind(null);
    setOffline(false);
    setOpening(true);
  }, []);
  const openReached = useCallback(() => reportReachability(true), []);
  const finishOpening = useCallback(() => setOpening(false), []);
  const failOpen = useCallback((e: unknown) => {
    if (e instanceof SpaceAccessError) {
      setOpenError(String(e.message));
      // A `SpaceAccessError` is access-shaped by default, but the keyring raises one
      // when it cannot build an encryptor at all — a crypto failure wearing an access
      // error's clothes, and the trigger the trust bypass exists to recover from.
      setOpenErrorKind(classifyError(e) === 'crypto' ? 'crypto' : 'access');
    } else {
      setOffline(true);
      reportReachability(false);
    }
    setOpening(false);
  }, []);

  return { opening, openError, openErrorKind, offline, reloadNonce, reload, beginOpen, openReached, finishOpening, failOpen };
}
