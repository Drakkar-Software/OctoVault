/**
 * App-wide owner of every space's `_access` record, mounted once near the root.
 * Before this, each consumer of a space's access record — the nav, a space screen,
 * the Composer's resolver, every ActivityFeed section, AND the space opener's
 * owner-check — called `readSpaceAccess` independently. This provider reads each
 * space's access record ONCE and shares it: the space opener awaits
 * {@link SpaceRegistryActions.ensure} imperatively. All consumers hit the same cache
 * and the same in-flight read.
 *
 * It sits BELOW SpacesProvider (reads the known-spaces snapshot for
 * `reconcileSpaceMeta`'s fast path) and ABOVE UnreadProvider.
 *
 * Freshness: a record is read once per space per session and then cached. Owner
 * edits on THIS device refresh it immediately (see `refresh`); an edit on ANOTHER
 * device shows up on the next app load or account switch.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { kvGet, kvSet } from '@drakkar.software/octovault-sdk';
import { readSpaceAccess, reconcileSpaceMeta } from '@drakkar.software/octovault-sdk';
import type { Session } from '@drakkar.software/octovault-sdk';
import { useSession } from './session-context';
import { useSpacesContext } from './spaces-context';

export interface SpaceRegistryEntry {
  owner: string | null;
  members: string[];
  name: string | null;
  image: string | null;
  hash: string | null;
  /** A read is in progress (true until the first read settles). */
  loading: boolean;
  /** A read has settled at least once — distinguishes "empty" from "not read yet". */
  loaded: boolean;
}

const PENDING: SpaceRegistryEntry = {
  owner: null, members: [], name: null, image: null, hash: null, loading: true, loaded: false,
};
const IDLE: SpaceRegistryEntry = { ...PENDING, loading: false };

// Offline cache of the plaintext `_access` record (same sensitivity as the
// drafts / outbox already in kv). Lets an offline read fall back to the last-synced
// entry instead of wiping it. Keyed by identity so it never bleeds across accounts.
const cacheKey = (userId: string, spaceId: string) => `octovault.registry-cache.${userId}.${spaceId}`;

/** Persist the DISPLAYABLE access-record fields — never the `hash`. Fire-and-forget. */
function persistEntry(userId: string, spaceId: string, entry: SpaceRegistryEntry): void {
  const { owner, members, name, image } = entry;
  void kvSet(cacheKey(userId, spaceId), JSON.stringify({ owner, members, name, image })).catch(() => {});
}

/** Load a previously-persisted entry (display-only → `hash: null`, `loaded: true`). */
async function loadCachedEntry(userId: string, spaceId: string): Promise<SpaceRegistryEntry | null> {
  try {
    const raw = await kvGet(cacheKey(userId, spaceId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<SpaceRegistryEntry>;
    return {
      owner: typeof d.owner === 'string' ? d.owner : null,
      members: Array.isArray(d.members) ? d.members.filter((m): m is string => typeof m === 'string') : [],
      name: typeof d.name === 'string' ? d.name : null,
      image: typeof d.image === 'string' ? d.image : null,
      hash: null,
      loading: false,
      loaded: true,
    };
  } catch {
    return null;
  }
}

/** Imperative side of the registry, for the space opener. */
interface SpaceRegistryActions {
  /** Current snapshot for a space (PENDING until its first read settles). */
  get: (spaceId: string) => SpaceRegistryEntry;
  /** Read a space's access record once (shared in-flight + cache); resolve its entry. */
  ensure: (spaceId: string) => Promise<SpaceRegistryEntry>;
  /** Force a fresh read (after an owner write). */
  refresh: (spaceId: string) => Promise<SpaceRegistryEntry>;
  /** Subscribe a consumer to a space (triggers `ensure`); returns an unsubscribe. */
  subscribe: (spaceId: string, cb: () => void) => () => void;
}

const Ctx = createContext<SpaceRegistryActions | null>(null);

export function SpaceRegistryProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { spaces } = useSpacesContext();
  const userId = session?.userId ?? null;

  // Provider-instance state held in refs so an entry update re-renders only the
  // consumers of THAT space (via its listener set), not the whole provider tree.
  const entries = useRef(new Map<string, SpaceRegistryEntry>());
  const inflight = useRef(new Map<string, Promise<SpaceRegistryEntry>>());
  const listeners = useRef(new Map<string, Set<() => void>>());
  const refCounts = useRef(new Map<string, number>());

  // Latest session/spaces, read by the stable `fetchEntry` below so `ensure`'s
  // identity never churns (which would re-run every consumer's subscribe effect).
  const sessionRef = useRef(session);
  const spacesRef = useRef(spaces);
  useEffect(() => {
    sessionRef.current = session;
    spacesRef.current = spaces;
  });

  const notify = useCallback((spaceId: string) => {
    const set = listeners.current.get(spaceId);
    if (set) for (const cb of set) cb();
  }, []);

  const get = useCallback((spaceId: string) => entries.current.get(spaceId) ?? PENDING, []);

  // The actual read, branched by space type — includes the best-effort
  // `reconcileSpaceMeta` that folds the shared name/image into this identity's
  // `_spaces` cache (skipped fast when already in sync).
  const fetchEntry = useCallback(async (spaceId: string): Promise<SpaceRegistryEntry> => {
    const s = sessionRef.current;
    if (!s) return IDLE;
    const { owner, members, name, image, hash } = await readSpaceAccess(s.contentClient, spaceId, s);
    void reconcileSpaceMeta(s.spacesRegistryClient, s, spaceId, { name, image }, spacesRef.current).catch(() => {});
    return { owner, members, name, image, hash, loading: false, loaded: true };
  }, []);

  // Run one read for a space, sharing the in-flight promise and publishing the
  // result. A FAILED read (offline / unreachable) never wipes a known-good entry:
  // it keeps the in-memory entry, else the persisted cache, else degrades to an
  // empty-but-loaded shell.
  const runFetch = useCallback((spaceId: string): Promise<SpaceRegistryEntry> => {
    const pending = inflight.current.get(spaceId);
    if (pending) return pending;
    const prev = entries.current.get(spaceId) ?? PENDING;
    entries.current.set(spaceId, { ...prev, loading: true });
    notify(spaceId);
    const uid = sessionRef.current?.userId ?? null;
    const p = fetchEntry(spaceId)
      .then((entry) => {
        if (entry.loaded && uid) persistEntry(uid, spaceId, entry);
        return entry;
      })
      .catch(async () => {
        if (prev.loaded) return { ...prev, loading: false };
        const cached = uid ? await loadCachedEntry(uid, spaceId) : null;
        return cached ?? { ...IDLE, loaded: true };
      })
      .then((entry) => {
        entries.current.set(spaceId, entry);
        return entry;
      })
      .finally(() => {
        inflight.current.delete(spaceId);
        notify(spaceId);
      });
    inflight.current.set(spaceId, p);
    return p;
  }, [fetchEntry, notify]);

  const ensure = useCallback((spaceId: string): Promise<SpaceRegistryEntry> => {
    const cached = entries.current.get(spaceId);
    if (cached?.loaded) return Promise.resolve(cached);
    return runFetch(spaceId);
  }, [runFetch]);

  const refresh = useCallback((spaceId: string): Promise<SpaceRegistryEntry> => {
    entries.current.delete(spaceId);
    return runFetch(spaceId);
  }, [runFetch]);

  const subscribe = useCallback((spaceId: string, cb: () => void) => {
    let set = listeners.current.get(spaceId);
    if (!set) {
      set = new Set();
      listeners.current.set(spaceId, set);
    }
    set.add(cb);
    refCounts.current.set(spaceId, (refCounts.current.get(spaceId) ?? 0) + 1);
    void ensure(spaceId);
    return () => {
      set!.delete(cb);
      const n = (refCounts.current.get(spaceId) ?? 1) - 1;
      if (n > 0) {
        refCounts.current.set(spaceId, n);
        return;
      }
      // Last consumer of this space left: drop its cached entry so re-entry reads
      // fresh (picking up changes an owner may have made elsewhere meanwhile).
      refCounts.current.delete(spaceId);
      entries.current.delete(spaceId);
      listeners.current.delete(spaceId);
    };
  }, [ensure]);

  // New identity (or sign-out): drop every cached entry so nothing bleeds across
  // accounts, and flip current consumers back to PENDING. We do NOT re-read here —
  // the still-subscribed spaceIds belong to the OLD account. Fresh reads are driven
  // by consumers' own subscribe effects. Old-account entries stay PENDING until their
  // consumers unmount (refCount → 0 → evicted).
  useEffect(() => {
    entries.current.clear();
    inflight.current.clear();
    for (const spaceId of listeners.current.keys()) notify(spaceId);
  }, [userId, notify]);

  const value = useMemo<SpaceRegistryActions>(
    () => ({ get, ensure, refresh, subscribe }),
    [get, ensure, refresh, subscribe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useRegistryActions(): SpaceRegistryActions {
  const v = useContext(Ctx);
  if (!v) throw new Error('Space registry hooks must be used within SpaceRegistryProvider');
  return v;
}

/** Imperative registry access for the space opener — `ensure`/`refresh`/`get`. */
export function useSpaceRegistryActions(): SpaceRegistryActions {
  return useRegistryActions();
}

