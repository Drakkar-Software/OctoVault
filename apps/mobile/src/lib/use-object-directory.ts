/**
 * Lazy loader for the public-object directory, scoped to the user's member spaces.
 *
 * Fetches only when `enabled` (i.e. the user is in Discover mode) so switching to
 * Content mode triggers no network call. When `enabled` flips true the directory is
 * loaded automatically; pull-to-refresh and error-retry both use `reload()`.
 *
 * Mirrors the data pipeline the old `(tabs)/discover/index.tsx` wired inside
 * `DiscoverScreen.loadEntries`: `readObjectDirectory()` → member-space filter →
 * `sortDiscoverEntries`. Logic extracted to `lib/` per the app's design rules.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { sortDiscoverEntries } from '@drakkar.software/dk-spaces-ui';
import type { DiscoverEntry } from '@drakkar.software/dk-spaces-ui';
import { humanizeError, readObjectDirectory } from '@drakkar.software/octovault-sdk';

import { useSession } from './session-context';
import { useSpaces } from './use-spaces';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface ObjectDirectoryResult {
  entries: DiscoverEntry[];
  status: Status;
  error: string | null;
  refreshing: boolean;
  reload: () => void;
}

export function useObjectDirectory(opts: { enabled: boolean }): ObjectDirectoryResult {
  const { enabled } = opts;
  const { session } = useSession();
  const { spaces } = useSpaces();

  // Hold the member-space set in a ref so the stable `load` always reads the latest
  // membership without becoming a dependency (avoids re-fetching on every render).
  const memberIdsRef = useRef(new Set<string>());
  memberIdsRef.current = new Set(spaces.map((s) => s.id));

  // Session ref: readObjectDirectory(session) needs the live session but must not
  // become a `load` dependency (would reset the cache on every re-render).
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [status, setStatus] = useState<Status>('idle');
  const [entries, setEntries] = useState<DiscoverEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const cancelledRef = useRef(false);

  // Stable fetch — reads memberIdsRef at call-time so the dep-array is empty.
  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setStatus('loading');
      setError(null);
    }
    try {
      if (!sessionRef.current) { setStatus('idle'); return; }
      const raw = await readObjectDirectory(sessionRef.current);
      if (cancelledRef.current) return;
      const filtered = raw.filter((e) => memberIdsRef.current.has(e.spaceId));
      setEntries(sortDiscoverEntries(filtered));
      setStatus('ready');
    } catch (err) {
      if (cancelledRef.current) return;
      if (!isRefresh) {
        // Hard-load failure: show error state.
        setError(humanizeError(err, 'Failed to load directory'));
        setStatus('error');
      }
      // Pull-to-refresh failure: keep the existing list silently (retry is there).
    } finally {
      if (!cancelledRef.current) setRefreshing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- memberIdsRef accessed via ref

  // Track status in a ref so reload() is also stable (no state deps).
  const statusRef = useRef(status);
  statusRef.current = status;

  /** Soft pull-to-refresh when ready; hard reload when error/idle. */
  const reload = useCallback(() => {
    void load(statusRef.current === 'ready');
  }, [load]);

  // Trigger a load when enabled flips true; cancel when it flips false (or unmount).
  useEffect(() => {
    if (!enabled) return;
    cancelledRef.current = false;
    void load(false);
    return () => {
      cancelledRef.current = true;
    };
  }, [enabled, load]);

  return { entries, status, error, refreshing, reload };
}
