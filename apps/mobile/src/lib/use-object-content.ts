/**
 * Generic content hook for any object with WAL-backed or plaintext content.
 *
 * Routes by node access flags:
 *   access:'public'          → objPub plaintext merge-doc (merge-kind only)
 *   access:'invite', enc:false → objInv cap-gated plaintext merge-doc (merge-kind only)
 *   access:'space'/'invite', enc:true → objLog WAL / objDoc merge-doc (E2EE, default)
 *
 * Hook-order stability: useWalDoc and both useMergeDoc variants are called
 * unconditionally every render with enabled gates so React never sees a different
 * number of hooks per render regardless of which content path is active.
 */
import { useCallback } from 'react';
import type { WalDocument } from '@drakkar.software/starfish-wal';

import { objLogName, objPubPull, objPubPush, objInvPull, objInvPush } from '@drakkar.software/octovault-sdk';
import type { ErrorKind, ObjectContentKind, NodeAccess } from '@drakkar.software/octovault-sdk';
import { useSession } from './session-context';
import { useSpaceOpen } from './use-room-open-flow';
import { useMergeDoc } from './use-merge-doc';
import { useDocLiveSync } from './use-doc-live-sync';
import { useWalDoc } from './use-wal-doc';
import { useSpaceObjects } from './space-objects-context';

// ── Shared helpers ─────────────────────────────────────────────────────────────

/**
 * Derive the three plaintext-routing flags from a node's access/enc fields.
 * Used by `useObjectContent` and any hook that needs to branch on the same
 * access-routing logic (e.g. `usePageComments`).
 */
export function classifyNodeAccess(node: { access?: string | null; enc?: boolean | null } | null | undefined) {
  const isPublicPlaintext = node?.access === 'public';
  const isInvitePlaintext = node?.access === 'invite' && !node.enc;
  const isPlaintext = isPublicPlaintext || isInvitePlaintext;
  return { isPublicPlaintext, isInvitePlaintext, isPlaintext };
}

/**
 * Shared WAL mutation helper. Returns a `mut` function that:
 * 1. Guards against `doc` being null (returns `undefined` when the WAL doc
 *    isn't open yet).
 * 2. Calls `touch()` after each write to bump the version and schedule a commit.
 *
 * Use in any hook that composes `useObjectContent`:
 *   const mut = useWalMutator(doc, touch);
 */
export function useWalMutator(doc: WalDocument | null, touch: () => void) {
  return useCallback(
    <T,>(fn: (d: WalDocument) => T): T | undefined => {
      if (!doc) return undefined;
      const r = fn(doc);
      touch();
      return r;
    },
    [doc, touch],
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ObjectContentHandle {
  /** WAL document — non-null once open (contentKind === 'append', default E2EE path). */
  walDoc: WalDocument | null;
  /** Plaintext merge-doc data for public/invite-plaintext nodes. */
  mergeDoc: Record<string, unknown> | null;
  contentKind: ObjectContentKind;
  ready: boolean;
  version: number;
  /** Bump version + debounce-commit. Call after any WAL mutation. */
  touch: () => void;
  pull: () => void;
  opening: boolean;
  openError: string | null;
  /** Why {@link openError} happened, so a caller can pick a recovery affordance.
   *  Never `'network'` — an unreachable server sets {@link offline} instead. */
  openErrorKind: ErrorKind | null;
  offline: boolean;
  reload: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Open a single object's content doc, expose the shared lifecycle state,
 * and wire live cross-device sync. Routes to objPub, objInv, or objLog/objDoc
 * based on the node's access flags. Compose this in `usePage`/`useBoard` wrappers
 * to add model-specific read/mutate ops on top.
 */
export function useObjectContent(
  spaceId: string,
  objectId: string,
  contentKind: ObjectContentKind,
  opts: { enabled?: boolean } = {},
): ObjectContentHandle {
  const { session } = useSession();
  const { objects } = useSpaceObjects();
  const node = objects.get(objectId);

  const base = (opts.enabled ?? true) && !!spaceId && !!objectId;

  const { isPublicPlaintext, isInvitePlaintext, isPlaintext } = classifyNodeAccess(node);

  const walEnabled = base && !isPlaintext && contentKind === 'append';

  // E2EE / default WAL path.
  const spaceOpen = useSpaceOpen({
    docId: objectId,
    spaceId,
    enabled: base && !isPlaintext,
    node: (node && !isPlaintext) ? { id: node.id, access: node.access as NodeAccess, enc: node.enc } : undefined,
  });

  // WAL doc (always called; gate via enabled for hook-order stability).
  const {
    doc: walDoc,
    ready: walReady,
    version,
    touch,
    pull: walPull,
    reload: reloadDoc,
    opening: walOpening,
    openError: walOpenError,
    openErrorKind: walOpenErrorKind,
    offline: walOffline,
  } = useWalDoc({
    client: spaceOpen.client,
    encryptor: spaceOpen.encryptor,
    documentKey: objLogName(spaceId, objectId),
    edPubHex: session?.keys.edPub,
    edPrivHex: session?.keys.edPriv,
    enabled: walEnabled && !!spaceOpen.client && !!spaceOpen.encryptor,
  });

  // Public plaintext path (objpub) — always called, gate via enabled.
  const pubPaths = useCallback(
    () => ({ pull: objPubPull(spaceId, objectId), push: objPubPush(spaceId, objectId) }),
    [spaceId, objectId],
  );
  const pubResult = useMergeDoc({
    spaceId,
    openId: objectId,
    enabled: base && isPublicPlaintext,
    storeKey: `objpub:${spaceId}:${objectId}`,
    privatePaths: pubPaths,
    node: (node && isPublicPlaintext) ? { id: node.id, access: 'public' as NodeAccess } : undefined,
  });

  // Invite-plaintext path (objinv) — always called, gate via enabled.
  const invPaths = useCallback(
    () => ({ pull: objInvPull(spaceId, objectId), push: objInvPush(spaceId, objectId) }),
    [spaceId, objectId],
  );
  const invResult = useMergeDoc({
    spaceId,
    openId: objectId,
    enabled: base && isInvitePlaintext,
    storeKey: `objinv:${spaceId}:${objectId}`,
    privatePaths: invPaths,
    node: (node && isInvitePlaintext) ? { id: node.id, access: 'invite' as NodeAccess, enc: false } : undefined,
    nodeId: isInvitePlaintext ? objectId : undefined,
  });

  // Derive the active lifecycle from the routed path.
  const activeReady = isPublicPlaintext ? pubResult.ready : isInvitePlaintext ? invResult.ready : walReady;
  const activePull  = isPublicPlaintext ? pubResult.pull  : isInvitePlaintext ? invResult.pull  : walPull;
  const activeOpening   = isPublicPlaintext ? pubResult.opening   : isInvitePlaintext ? invResult.opening   : (spaceOpen.opening || walOpening);
  const activeOpenError = isPublicPlaintext ? pubResult.openError : isInvitePlaintext ? invResult.openError : (spaceOpen.openError ?? walOpenError);
  const activeOffline   = isPublicPlaintext ? pubResult.offline   : isInvitePlaintext ? invResult.offline   : (spaceOpen.offline || walOffline);
  // The space open fails first and shadows the WAL open, so its kind wins when set.
  // It carries the keyring's own `'crypto'` verdict — the trusted-adder mismatch that
  // the trust bypass recovers from — so this must NOT be flattened to `'access'`.
  const activeOpenErrorKind: ErrorKind | null = isPublicPlaintext
    ? pubResult.openErrorKind
    : isInvitePlaintext
      ? invResult.openErrorKind
      : (spaceOpen.openError ? spaceOpen.openErrorKind : walOpenErrorKind);

  // Live cross-device sync (focus-pull + SSE poll).
  useDocLiveSync({ docId: objectId, ready: activeReady, pull: activePull, skipFirstFocus: true, firstFocusKey: objectId });

  const reload = useCallback(() => {
    spaceOpen.reload();
    reloadDoc();
    pubResult.reload();
    invResult.reload();
  }, [spaceOpen.reload, reloadDoc, pubResult.reload, invResult.reload]);

  return {
    walDoc,
    mergeDoc: isPublicPlaintext ? pubResult.doc : isInvitePlaintext ? invResult.doc : null,
    contentKind,
    ready: base ? activeReady : false,
    version,
    touch,
    pull: activePull,
    opening: base ? activeOpening : false,
    openError: activeOpenError,
    openErrorKind: activeOpenErrorKind,
    offline: activeOffline,
    reload,
  };
}
