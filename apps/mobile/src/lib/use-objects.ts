import { useCallback, useMemo, useRef } from 'react';

import { objIndexPull, objIndexPush, createNode } from '@drakkar.software/octovault-sdk';
import {
  addObject,
  ancestors as ancestorsOf,
  archiveObject as archiveObjectNodes,
  breadcrumbs as breadcrumbsOf,
  buildTree,
  clearProp,
  patchObject,
  reorderObjects,
  reparentObject,
  setProps as setPropsReducer,
  subtreeIds,
  type NewObjectInput,
  type ObjectTreeNode,
  type NodeAccess,
} from '@drakkar.software/octovault-sdk';
import type { ID, ObjectNode, PropValue } from '@drakkar.software/octovault-sdk';
import { getMemberCap } from '@drakkar.software/octovault-sdk';
import { useMergeDoc } from './use-merge-doc';
import { useDocLiveSync } from './use-doc-live-sync';
import { stripInviteIndexFields } from './object-index-utils';
import { useSession } from './session-context';
import { useSpaceRegistryActions } from './space-registry-context';

/** The unified object-index hook for one space — a union-merged merge-doc (see
 *  {@link useMergeDoc}) exposing the repaired render tree plus the create/rename/move/
 *  archive/reorder mutations every Work + sidebar surface consumes. Purely additive
 *  today: room CONTENT and the legacy `_access` registry are untouched; this index is
 *  the new home for docs/projects (and, once consumers migrate, rooms). */
export interface ObjectsHook {
  tree: ObjectTreeNode[];
  nodes: ObjectNode[];
  /** The RAW node list including archived entries — the Trash view's source.
   *  Everything else should keep reading `nodes`/`tree` (archived filtered out). */
  allNodes: ObjectNode[];
  breadcrumbs: (id: ID) => ObjectNode[];
  /** Root→parent trail (EXCLUSIVE of `id`) for a detail screen's breadcrumb. */
  ancestors: (id: ID) => ObjectNode[];
  get: (id: ID) => ObjectNode | undefined;
  opening: boolean;
  openError: string | null;
  offline: boolean;
  ready: boolean;
  /** True once the index has painted — use this (not `ready`) to tell an empty
   *  workspace apart from one still loading. */
  loaded: boolean;
  reload: () => void;
  /** Pull the latest index from the server into this store (used by the shared
   *  {@link SpaceObjectsProvider} for live convergence). */
  pull: () => void;
  create: (input: NewObjectInput) => ID | null;
  /**
   * Create a node with non-default access flags (public / invite / invite+enc).
   * Async: calls createNode server-side (which handles keyring minting for enc:true
   * and title/emoji stripping for invite nodes in the index). Returns the new node id.
   */
  createWithAccess: (input: NewObjectInput, flags: { access: NodeAccess; enc: boolean }) => Promise<ID | null>;
  rename: (id: ID, patch: { title?: string; emoji?: string }) => void;
  move: (id: ID, parentId: ID | null) => void;
  reorder: (orderById: Record<ID, number>) => void;
  archive: (id: ID) => void;
  /** Un-archive a node and its whole subtree — the "Undo" of {@link archive} and
   *  the Trash view's Restore. Restores the SAME id set archive cascaded over. */
  restore: (id: ID) => void;
  /** Delete-forever: drop a node + subtree from the index. Best-effort under
   *  union-merge — a stale replica that re-pushes its copy resurrects the nodes,
   *  but they come back `archived: true` (the flag rides each node), so the
   *  failure mode is "reappears in Trash", never "reappears in the workspace". */
  purge: (id: ID) => void;
  /** Merge a props patch into a node's index entry (node-level LWW). */
  setProps: (id: ID, patch: Record<string, PropValue>) => void;
  /** Remove a single key from a node's props map (node-level LWW). */
  clearProp: (id: ID, key: string) => void;
  /** Apply an arbitrary stamped reducer to the node list (for composite ops like the
   *  room/category helpers in {@link useRooms}). Returns false when not writable yet. */
  mutate: (reducer: (nodes: ObjectNode[], now: number) => ObjectNode[]) => boolean;
}

export function useObjects(spaceId: string, opts: { enabled?: boolean; liveSync?: boolean } = {}): ObjectsHook {
  const enabled = (opts.enabled ?? true) && !!spaceId;
  const { session } = useSession();
  const { ensure: ensureRegistry } = useSpaceRegistryActions();

  const { doc, ready, loaded, opening, openError, offline, reload, apply, pull } = useMergeDoc({
    spaceId,
    openId: spaceId,
    enabled,
    storeKey: `objindex:${spaceId}`,
    // objindex is plaintext (encryption:"none") — always use null encryptor.
    plaintext: true,
    privatePaths: () => ({ pull: objIndexPull(spaceId), push: objIndexPush(spaceId) }),
  });

  // Refresh-on-focus parity with chat (see {@link useDoc} / {@link useRoom}): a screen
  // that edits a doc/project pushes to the server through its OWN index store, so a
  // separately-mounted Work surface only sees the change on its next pull. Reuse the
  // shared {@link useDocLiveSync} to focus-pull (+ poll while SSE is down) the index.
  // SSE events carry `spaceId` in their params — `useEventsStream` dispatches
  // `dispatchDocChange(spaceId)`, which fires this store's registered pull live.
  // OPT-IN (`liveSync`): this calls useFocusEffect, which needs a router screen. The
  // index is also mounted in the desktop sidebar (outside a focus screen), so we must
  // NOT call the hook there — gated by a flag that is static per mount, keeping hook
  // order stable.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- `liveSync` is fixed per call site (never toggles for a mounted instance), so the hook order is stable
  if (opts.liveSync) useDocLiveSync({ docId: spaceId, ready, pull, skipFirstFocus: true, firstFocusKey: spaceId });

  const objects = useMemo<ObjectNode[]>(() => (Array.isArray(doc?.objects) ? (doc!.objects as ObjectNode[]) : []), [doc]);

  // Monotonic per-session stamp avoids same-ms collisions while staying a valid
  // union-merge ordering key (threaded into the pure reducers; never Date.now() inline).
  const nowRef = useRef(0);
  const stamp = useCallback(() => {
    const t = Date.now();
    nowRef.current = t > nowRef.current ? t : nowRef.current + 1;
    return nowRef.current;
  }, []);

  const applyNodes = useCallback(
    (reducer: (objects: ObjectNode[]) => ObjectNode[]) =>
      apply((d) => ({ ...d, objects: reducer((d.objects as ObjectNode[]) ?? []) })),
    [apply],
  );

  const create = useCallback(
    (input: NewObjectInput): ID | null => {
      const now = stamp();
      // Default enc:true so WAL content nodes open their E2EE store (the space
      // keyring is minted lazily on first owner-open via getNodeAccess).
      const effectiveInput: NewObjectInput = { enc: true, ...input };
      const built = addObject(objects, effectiveInput, now);
      const ok = applyNodes((cur) => addObject(cur, { ...effectiveInput, id: built.node.id }, now).nodes);
      return ok ? built.node.id : null;
    },
    [objects, stamp, applyNodes],
  );

  const rename = useCallback((id: ID, patch: { title?: string; emoji?: string }) => {
    const now = stamp();
    const indexPatch = stripInviteIndexFields(id, patch, objects);
    applyNodes((cur) => patchObject(cur, id, indexPatch, now));
  }, [stamp, applyNodes, objects]);

  const move = useCallback((id: ID, parentId: ID | null) => {
    const now = stamp();
    applyNodes((cur) => reparentObject(cur, id, parentId, now));
  }, [stamp, applyNodes]);

  const reorder = useCallback((orderById: Record<ID, number>) => {
    const now = stamp();
    applyNodes((cur) => reorderObjects(cur, orderById, now));
  }, [stamp, applyNodes]);

  const archive = useCallback((id: ID) => {
    const now = stamp();
    applyNodes((cur) => archiveObjectNodes(cur, id, now));
  }, [stamp, applyNodes]);

  const restore = useCallback((id: ID) => {
    const now = stamp();
    applyNodes((cur) => {
      const ids = subtreeIds(cur, id);
      return cur.map((n) => (ids.has(n.id) && n.archived ? { ...n, archived: false, updatedAt: now } : n));
    });
  }, [stamp, applyNodes]);

  const purge = useCallback((id: ID) => {
    applyNodes((cur) => {
      const ids = subtreeIds(cur, id);
      // Only drop ARCHIVED members: a live node can sit inside an archived subtree
      // (created concurrently on another device, merged in later) — buildTree
      // already renders it as a root orphan, and deleting it here would destroy
      // content the user never archived.
      return cur.filter((n) => !(ids.has(n.id) && n.archived));
    });
  }, [applyNodes]);

  const createWithAccess = useCallback(async (
    input: NewObjectInput,
    flags: { access: NodeAccess; enc: boolean },
  ): Promise<ID | null> => {
    if (!session) return null;
    // Always fetch the registry so enc:true nodes mint the keyring for ALL current
    // members (not just the owner). getMemberCap short-circuit would skip this.
    await ensureRegistry(spaceId);
    const node = await createNode(session, spaceId, { ...input, ...flags });
    // Optimistic local insert so the sidebar and open-screen see the new node
    // immediately — pull() converges with the authoritative server state.
    applyNodes((cur) => addObject(cur, { ...input, ...flags, id: node.id }, stamp()).nodes);
    pull();
    return node.id;
  }, [session, spaceId, ensureRegistry, pull, stamp, applyNodes]);

  const setProps = useCallback((id: ID, patch: Record<string, PropValue>) => {
    const now = stamp();
    applyNodes((cur) => setPropsReducer(cur, id, patch, now));
  }, [stamp, applyNodes]);

  const clearPropFn = useCallback((id: ID, key: string) => {
    const now = stamp();
    applyNodes((cur) => clearProp(cur, id, key, now));
  }, [stamp, applyNodes]);

  const mutate = useCallback((reducer: (nodes: ObjectNode[], now: number) => ObjectNode[]) => {
    const now = stamp();
    return applyNodes((cur) => reducer(cur, now));
  }, [stamp, applyNodes]);

  const tree = useMemo(() => buildTree(objects), [objects]);
  const nodes = useMemo(() => objects.filter((n) => !n.archived), [objects]);
  const breadcrumbs = useCallback((id: ID) => breadcrumbsOf(objects, id), [objects]);
  const ancestors = useCallback((id: ID) => ancestorsOf(objects, id), [objects]);
  const get = useCallback((id: ID) => objects.find((n) => n.id === id), [objects]);

  return { tree, nodes, allNodes: objects, breadcrumbs, ancestors, get, opening, openError, offline, ready, loaded, reload, pull, create, createWithAccess, rename, move, reorder, archive, restore, purge, setProps, clearProp: clearPropFn, mutate };
}
