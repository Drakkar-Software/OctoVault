/**
 * The member roster of a space — the userIds from its `_access` record (owner +
 * members), each resolved to a display name/avatar through the shared profile cache.
 *
 * React Compiler note (see use-pseudos.ts caveat + AccountSwitcher.tsx precedent):
 * the member id set is STABLE, so the compiler would memoize the resolver-derived
 * rows and a fetched name/avatar would never reach the screen. `'use no memo'` opts
 * this hook out, and the rows are recomputed every render (NOT wrapped in a useMemo
 * keyed on the stable ids) so the profile-cache listener tick refreshes them.
 */
import { useCallback, useEffect, useState } from 'react';

import { readSpaceAccess, removeSpaceMember as removeSpaceMemberDoc, fingerprintFromUserId } from '@drakkar.software/octovault-sdk';
import { useAvatars, usePseudos } from './use-pseudos';
import { useSession } from './session-context';

export interface SpaceMember {
  userId: string;
  /** Resolved display name, or undefined until the profile cache lands. */
  name?: string;
  /** Resolved avatar data URI, or undefined → render the monogram. */
  avatar?: string;
  /** Short hex fingerprint shown when no display name is resolvable. */
  fingerprint: string;
  /** 2-letter monogram for the avatar fallback. */
  monogram: string;
  isOwner: boolean;
  /** True while the profile cache may still resolve a name — render a Skeleton in
   *  the name slot instead of flashing the raw fingerprint on first paint. Flips
   *  false when a name lands OR the grace window passes (a user with no profile
   *  doc keeps the fingerprint as their permanent label). */
  resolving: boolean;
}

export interface SpaceMembers {
  members: SpaceMember[];
  owner: string | null;
  loading: boolean;
  /** False for a public space (no roster to show). */
  hasRoster: boolean;
  /** Owner-side: remove a member from the roster, then refetch. */
  removeMember: (memberUserId: string) => Promise<void>;
  /** Re-read the roster (after a remove, or to pick up an owner's invite elsewhere). */
  refresh: () => Promise<void>;
}

const monogramOf = (id: string) => id.slice(0, 2).toUpperCase();

/** How long an unresolved name keeps its Skeleton before falling back to the
 *  fingerprint. The profile cache resolves in one batched roundtrip, so anything
 *  still nameless after this window is a user with no profile doc — for them the
 *  fingerprint IS the name, and a Skeleton would shimmer forever. */
const PROFILE_RESOLVE_GRACE_MS = 2500;

export function useSpaceMembers(spaceId: string): SpaceMembers {
  // Opt out of React-Compiler memoization: the resolved member id set is stable, so
  // memoized resolver JSX would never show a fetched name/avatar. See header note.
  'use no memo';
  const { session } = useSession();
  const [owner, setOwner] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session || !spaceId) {
      setLoading(false);
      return;
    }
    try {
      const { owner: ownr, members } = await readSpaceAccess(session.contentClient, spaceId, session);
      setOwner(ownr);
      // Owner first, then members — deduped (the roster never includes the owner, but
      // be defensive against a legacy doc that did).
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const id of [...(ownr ? [ownr] : []), ...members]) {
        if (!seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
      setIds(ordered);
    } catch (e) {
      console.error('[useSpaceMembers] failed to read roster', e);
    } finally {
      setLoading(false);
    }
  }, [session, spaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: show loading while (re)reading the roster
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Grace window for name resolution: starts once the roster ids land, after which
  // an unresolved member stops skeleton-ing and shows their fingerprint (see
  // PROFILE_RESOLVE_GRACE_MS). State (not a ref) so the flip re-renders the rows.
  const [graceOver, setGraceOver] = useState(false);
  const hasIds = ids.length > 0;
  useEffect(() => {
    if (!hasIds) return;
    const t = setTimeout(() => setGraceOver(true), PROFILE_RESOLVE_GRACE_MS);
    return () => clearTimeout(t);
  }, [hasIds]);

  // Resolve names + avatars through the shared cache (one batched fetch). These return
  // accessors over a module cache; the rows below are rebuilt every render so the
  // listener tick (a fetched profile) reaches the screen — see header note.
  const pseudo = usePseudos(ids);
  const avatar = useAvatars(ids);

  const members: SpaceMember[] = ids.map((userId) => {
    const name = pseudo(userId);
    return {
      userId,
      name,
      avatar: avatar(userId),
      fingerprint: fingerprintFromUserId(userId),
      monogram: monogramOf(userId),
      isOwner: userId === owner,
      resolving: name === undefined && !graceOver,
    };
  });

  const removeMember = useCallback(
    async (memberUserId: string) => {
      if (!session) return;
      await removeSpaceMemberDoc(session.contentClient, spaceId, memberUserId, session);
      await refresh();
    },
    [session, spaceId, refresh],
  );

  return { members, owner, loading, hasRoster: true, removeMember, refresh };
}
