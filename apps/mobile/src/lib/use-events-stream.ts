/**
 * Mounts a single SSE connection to the server's /events endpoint so open
 * docs update live without waiting for the 4-second fallback poll.
 *
 * One stream per session × space-set. Reconnects automatically (capped
 * exponential backoff handled by subscribeChanges in dk-spaces-sdk). Tears
 * down cleanly on session change, space-set change, or unmount.
 *
 * Wire-up: call inside SpacesProvider (has both session + spaces).
 */
import { useEffect, useRef } from 'react';

import { buildAuthHeaders, subscribeChanges } from '@drakkar.software/octovault-sdk';
import { dispatchDocChange, emitSseStatus } from '@drakkar.software/octovault-sdk';
import type { Session } from '@drakkar.software/octovault-sdk';

import { extractChangedIds } from './events-stream';
import type { ChangedIds } from './events-stream';

export function useEventsStream(session: Session | null, spaceIds: string[]): void {
  // Stable key: re-run only when the session identity or the space set changes.
  const spaceKey = spaceIds.join(',');

  // Keep a ref to the latest session so the authHeaders callback always uses
  // fresh cap credentials across reconnects, even if the session object rotates
  // without the userId changing (which does NOT trigger effect re-run).
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- spaceKey is the stable dep for spaceIds
  useEffect(() => {
    if (!session || spaceIds.length === 0) {
      emitSseStatus(false);
      return;
    }

    const unsubscribe = subscribeChanges<ChangedIds>({
      spaces: spaceIds,
      authHeaders: (method, pathAndQuery) => {
        const s = sessionRef.current;
        if (!s) return Promise.reject(new Error('no session'));
        return buildAuthHeaders(s.contentCap, s.keys.edPriv, method, pathAndQuery);
      },
      parse: extractChangedIds,
      onChange: ({ spaceId, objectId, nodeId }) => {
        if (spaceId) dispatchDocChange(spaceId);
        if (objectId) dispatchDocChange(objectId);
        // nodeId is an alias for objectId in some collections; dispatch only if distinct.
        if (nodeId && nodeId !== objectId) dispatchDocChange(nodeId);
      },
      onStatus: emitSseStatus,
    });

    return () => {
      unsubscribe();
      emitSseStatus(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, spaceKey]);
}
