import { useCallback, useEffect, useMemo, useState } from 'react';
import { createUnionMerge } from '@drakkar.software/starfish-client';
import { useSyncInit } from '@drakkar.software/starfish-client/zustand';

import { getSyncBase, getSyncNamespace } from '@drakkar.software/octovault-sdk';
import { capProviderFor } from '@drakkar.software/octovault-sdk';
import { fetchWithTimeout } from '@drakkar.software/octovault-sdk';
import { getMemberCap, getNodeAccessEntry } from '@drakkar.software/octovault-sdk';
import { pullCache, PULL_CACHE_MAX_AGE_MS } from '@drakkar.software/octovault-sdk';
import type { ErrorKind, NodeAccess, SpaceAccessEntry } from '@drakkar.software/octovault-sdk';
import { useSession } from './session-context';
import { useSpaceOpen } from './use-room-open-flow';

/** A pull/push path pair for a Starfish merge-doc. */
export interface DocPaths {
  pull: string;
  push: string;
}

export interface MergeDocOptions {
  /** The space the doc lives in (drives the encryptor and member client). */
  spaceId: string;
  /** The id passed to {@link useSpaceOpen} (the space id for a space-wide doc like the
   *  object index, or the object id for a per-object doc). Only keys the open/effect. */
  openId: string;
  enabled: boolean;
  /** Unique suffix for the SDK store name (e.g. `objindex:<spaceId>`). */
  storeKey: string;
  /** Build the paths for this doc. */
  privatePaths: () => DocPaths;
  /** When provided, pass to useSpaceOpen for per-node crypto (getNodeAccess). */
  node?: { id: string; access?: NodeAccess; enc?: boolean };
  /** When provided, look up the node-specific cap for the capProvider (objinv path). */
  nodeId?: string;
  /** When true, always use null encryptor (space-wide plaintext docs like objindex). */
  plaintext?: boolean;
}

export interface MergeDocResult {
  /** The current doc data (the merged document), or null before the first read. */
  doc: Record<string, unknown> | null;
  /** True once the store is open and safe to mutate (offline-first; see {@link apply}). */
  ready: boolean;
  /** True once data has actually painted (cache or first pull) — distinguishes a
   *  genuinely-empty doc from one still loading. `ready` flips on store-open, which is
   *  too eager to drive an empty-state vs. spinner decision; gate that on `loaded`. */
  loaded: boolean;
  opening: boolean;
  openError: string | null;
  /** Why {@link openError} happened — `'crypto'` unlocks the keyring recovery UI. */
  openErrorKind: ErrorKind | null;
  offline: boolean;
  reload: () => void;
  /** Apply an update to the live doc (no-op + false when not ready). */
  apply: (update: (doc: Record<string, unknown>) => Record<string, unknown>) => boolean;
  /** Trigger a fresh server pull of the doc (for live-sync on an SSE change). No-op
   *  before the store exists. */
  pull: () => void;
}

/**
 * Generic union-merged Starfish doc hook — the shared core of {@link useObjects} (the
 * object index) and {@link useDoc} (a doc's block content), factored out of the
 * near-identical bodies they used to duplicate. Handles the space-wide encryptor open,
 * `useSyncInit` with a union-merge resolver, offline-first cache paint, and the
 * liveReady/subscribe gate that defers mutations until a fresh pull confirms the store
 * is writable. `encryptor` is null for plaintext docs (the store syncs without sealing).
 * Callers layer their domain shape (which array, which mutations) on top.
 */
export function useMergeDoc(opts: MergeDocOptions): MergeDocResult {
  const { spaceId, openId, enabled, storeKey, privatePaths, node, nodeId, plaintext } = opts;
  const { session } = useSession();

  const { encryptor, client, opening, openError, openErrorKind, offline, reload } = useSpaceOpen({
    docId: openId,
    spaceId,
    enabled,
    node,
    plaintext,
  });

  const config = useMemo(() => {
    if (!enabled || !session || !client) return null;
    const base = {
      serverUrl: getSyncBase(),
      namespace: getSyncNamespace(),
      onConflict: createUnionMerge({ idKey: 'id', timestampKey: 'updatedAt' }),
      storage: false as const,
      fetch: fetchWithTimeout(),
      cache: pullCache(),
      cacheMaxAgeMs: PULL_CACHE_MAX_AGE_MS,
    };
    // For objinv (invite-plaintext), try the node-specific cap first so the
    // sharing plugin path-match accepts the request. Falls back to the space
    // member cap (valid for space:member with paths: ['spaces/{id}/**']).
    const nodeEntry = nodeId ? getNodeAccessEntry(spaceId, nodeId) : null;
    const memberCap = getMemberCap(spaceId);
    const nodeEntryCap = nodeEntry?.kind === 'member' ? nodeEntry.cap : null;
    const rawCap = nodeEntryCap ?? (memberCap ? memberCap : null);
    const cap = rawCap ? JSON.parse(rawCap) : session.contentCap;
    const paths = privatePaths();
    return {
      ...base,
      capProvider: capProviderFor(cap, session.keys.edPriv),
      pullPath: paths.pull,
      pushPath: paths.push,
      ...(encryptor ? { encryptor } : {}),
      storeName: `md-${session.userId}-${storeKey}`,
    };
    // privatePaths is stable per render from the caller's closure; the path
    // values it returns are captured by spaceId/openId which ARE deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, session, client, encryptor, spaceId, storeKey, nodeId]);

  const store = useSyncInit(config);

  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset data when the store identity changes (space/object switch or reopen)
    setDoc(null);
    if (!store) return;
    const read = () => {
      const s = store.getState() as { data?: Record<string, unknown> };
      setDoc(s.data ?? null);
    };
    read();
    return store.subscribe(() => read());
  }, [store]);

  // Writable as soon as the store is open (client resolved) — we do NOT wait for a
  // fresh pull to settle. These docs are union-merged (by `id` + `updatedAt`), so a
  // node/block created offline-first merges cleanly with server state on the next pull;
  // gating writes on a settled sync instead left creation permanently dead whenever the
  // first pull never settled (offline / unreachable server / a brand-new empty doc).
  // `update` runs SYNCHRONOUSLY inside `set` (the zustand store invokes the updater
  // immediately to compute the next state). Callers rely on this to read a value computed
  // inside the updater right after `apply` returns — keep it synchronous if reworked.
  const apply = useCallback(
    (update: (doc: Record<string, unknown>) => Record<string, unknown>) => {
      if (!store) return false;
      store.getState().set((d: Record<string, unknown>) => update(d));
      return true;
    },
    [store],
  );
  const pull = useCallback(() => {
    if (store) void (store.getState() as { pull?: () => Promise<unknown> }).pull?.();
  }, [store]);

  return { doc, ready: !!store, loaded: doc !== null, opening: enabled ? opening : false, openError, openErrorKind, offline, reload, apply, pull };
}
