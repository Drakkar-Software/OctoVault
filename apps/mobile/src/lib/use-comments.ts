import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { WalDocument } from '@drakkar.software/starfish-wal';

import * as discussion from '@drakkar.software/octovault-sdk';
import {
  objLogName,
  getReadPrefs, getRoomReadAt, setRoomReadAt, subscribeReads,
} from '@drakkar.software/octovault-sdk';
import type { DiscussionThread, NodeAccess } from '@drakkar.software/octovault-sdk';

import { useSession } from './session-context';
import { useSpaceObjects } from './space-objects-context';
import { useSpaceOpen } from './use-room-open-flow';
import { useWalDoc } from './use-wal-doc';
import { useDocLiveSync } from './use-doc-live-sync';
import { getNotificationSettings, subscribeNotificationSettings } from './notification-settings';

export type { Comment, CommentReaction, DiscussionThread } from '@drakkar.software/octovault-sdk';

/** The sibling comments doc id for a page (a synthetic object id under the same
 *  space — sealed by the same space keyring, authorized by the space-member cap). */
const commentsDocId = (pageId: string) => `${pageId}~comments`;
/** Per-(page, block) read-mark key, reusing the synced read-marks store (`reads.ts`). */
const readKey = (pageId: string, blockId: string) => `${pageId}~comments~${blockId}`;

export interface CommentsHook {
  /** Every block's discussion that holds at least one comment, keyed by block id. */
  threads: Map<string, DiscussionThread>;
  /** Block ids whose discussion has a comment from someone else since it was last
   *  read — the gutter "unread" set (empty when notifications are disabled). */
  unread: Set<string>;
  /** Whether comments are supported for this page (E2EE/space pages only in v1). */
  supported: boolean;
  /** The viewer's account id — for attributing UI (own comments, reactions). */
  currentUserId: string;
  ready: boolean;
  opening: boolean;
  openError: string | null;
  offline: boolean;
  reload: () => void;
  /** Add a comment to a block's discussion. Returns the new comment id. */
  addComment: (blockId: string, text: string) => string | undefined;
  /** Edit a comment's body (character-level merge). */
  editComment: (commentId: string, text: string) => void;
  removeComment: (blockId: string, commentId: string) => void;
  resolveThread: (blockId: string, resolved: boolean) => void;
  /** Toggle the current user's emoji reaction on a comment. */
  toggleReaction: (commentId: string, emoji: string) => void;
  /** Advance the read mark for a block's discussion (call when it's opened). */
  markThreadRead: (blockId: string) => void;
}

/**
 * One page's per-block discussions, backed by a sibling {@link WalDocument} (its
 * own op-log + snapshot, separate from the page content doc). Mirrors
 * {@link usePage}: opens via the page node's space crypto (`useSpaceOpen` +
 * `useWalDoc`), projects with {@link discussion.readThreads}, mutates through the
 * pure `comments-content` ops, and live-syncs across members via the SSE bus.
 *
 * v1 targets E2EE/space-access pages; public / invite-plaintext pages report
 * `supported: false` (their comments would ride the plaintext merge-doc path).
 */
export function usePageComments(spaceId: string, pageId: string, opts: { enabled?: boolean } = {}): CommentsHook {
  const { session } = useSession();
  const { objects } = useSpaceObjects();
  const node = objects.get(pageId);

  const userId = session?.userId ?? '';
  const docId = commentsDocId(pageId);

  // Comments live in the same E2EE/space keyring as the page. Public/invite-plaintext
  // pages aren't supported in v1 (they'd need the plaintext merge-doc path).
  const isPublicPlaintext = node?.access === 'public';
  const isInvitePlaintext = node?.access === 'invite' && !node.enc;
  const isPlaintext = isPublicPlaintext || isInvitePlaintext;
  const supported = !!node && !isPlaintext;
  const enabled = (opts.enabled ?? true) && !!spaceId && !!pageId && supported;

  // Resolve the page node's space keyring encryptor + client (same crypto the page
  // content uses), then open the comments doc under the derived key.
  const spaceOpen = useSpaceOpen({
    docId,
    spaceId,
    enabled,
    node: supported ? { id: node!.id, access: node!.access as NodeAccess, enc: node!.enc } : undefined,
  });

  const { doc, ready, version, touch, pull, reload, opening, openError } = useWalDoc({
    client: spaceOpen.client,
    encryptor: spaceOpen.encryptor,
    documentKey: objLogName(spaceId, docId),
    edPubHex: session?.keys.edPub,
    edPrivHex: session?.keys.edPriv,
    enabled: enabled && !!spaceOpen.client && !!spaceOpen.encryptor,
  });

  // Live cross-member sync: the comment append already fans out as an
  // `octospaces.object.changed` event over SSE, so other members re-pull live.
  useDocLiveSync({ docId, ready, pull, skipFirstFocus: true, firstFocusKey: doc });

  // `version` is the recompute trigger — the WalDocument is mutated in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const threads = useMemo<Map<string, DiscussionThread>>(() => (doc ? discussion.readThreads(doc) : new Map()), [doc, version]);

  // Re-render on read-mark / notification-setting changes so the unread set tracks them.
  const reads = useSyncExternalStore(subscribeReads, getReadPrefs, getReadPrefs);
  const notif = useSyncExternalStore(subscribeNotificationSettings, getNotificationSettings, getNotificationSettings);

  const unread = useMemo(() => {
    const set = new Set<string>();
    if (!notif.enabled) return set;
    for (const [blockId, thread] of threads) {
      const readAt = getRoomReadAt(readKey(pageId, blockId));
      if (thread.comments.some((c) => c.author !== userId && c.createdAt > readAt)) set.add(blockId);
    }
    return set;
    // `reads` is a dep so the set recomputes when a mark advances on this/another device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, reads, notif.enabled, userId, pageId]);

  const mut = useCallback(
    <T,>(fn: (d: WalDocument) => T): T | undefined => {
      if (!doc) return undefined;
      const r = fn(doc);
      touch();
      return r;
    },
    [doc, touch],
  );

  const markThreadRead = useCallback(
    (blockId: string) => {
      if (session) setRoomReadAt(session, readKey(pageId, blockId), Date.now());
    },
    [session, pageId],
  );

  return {
    threads,
    unread,
    supported,
    currentUserId: userId,
    ready,
    opening,
    openError,
    offline: spaceOpen.offline,
    reload,
    addComment: (blockId, text) => mut((d) => discussion.addComment(d, blockId, userId, text)),
    editComment: (commentId, text) => mut((d) => discussion.setCommentBody(d, commentId, text)),
    removeComment: (blockId, commentId) => mut((d) => discussion.removeComment(d, blockId, commentId)),
    resolveThread: (blockId, resolved) => mut((d) => discussion.resolveThread(d, blockId, resolved)),
    toggleReaction: (commentId, emoji) => mut((d) => discussion.toggleReaction(d, commentId, userId, emoji)),
    markThreadRead,
  };
}
