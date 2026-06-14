/**
 * Mounts a single SSE connection to the server's /events endpoint so open
 * docs update live without waiting for the 4-second fallback poll.
 *
 * One stream per session × space-set. Reconnects automatically (capped
 * exponential backoff). Tears down cleanly on session change or unmount.
 *
 * Wire-up: call inside SpacesProvider (has both session + spaces).
 */
import { useEffect, useRef } from 'react';

import { buildAuthHeaders, getEventsUrl, getSyncBase } from '@drakkar.software/octovault-sdk';
import { dispatchDocChange, emitSseStatus } from '@drakkar.software/octovault-sdk';
import type { Session } from '@drakkar.software/octovault-sdk';

import { buildSignedEventsRequest, openEventsStream } from './events-stream';

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function useEventsStream(session: Session | null, spaceIds: string[]): void {
  // Stable key: re-run only when the session identity or the space set changes.
  const spaceKey = spaceIds.join(',');

  // Keep latest refs so the async loop always reads fresh values without
  // re-creating the effect (which would tear down a live stream unnecessarily).
  const sessionRef = useRef(session);
  const spaceIdsRef = useRef(spaceIds);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { spaceIdsRef.current = spaceIds; }, [spaceIds]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- spaceKey is the stable dep for spaceIds
  useEffect(() => {
    if (!session || spaceIds.length === 0) {
      emitSseStatus(false);
      return;
    }

    let cancelled = false;
    let backoff = MIN_BACKOFF_MS;
    const ac = new AbortController();

    void (async () => {
      while (!cancelled) {
        const s = sessionRef.current;
        const ids = spaceIdsRef.current;
        if (!s || ids.length === 0) break;

        // Build the fetch URL and the signed pathAndQuery.
        // buildSignedEventsRequest strips the getSyncBase() mount prefix (e.g.
        // "/sync") from the signed path so it matches the path the nginx origin
        // verifies after stripping the mount — exactly as starfish-client's /pull
        // signs applyNamespace(path) without the baseUrl prefix.  The comma is
        // encoded to %2C (CDN-safe); the fetch URL retains the full mount path.
        const { url, pathAndQuery } = buildSignedEventsRequest(
          getEventsUrl(),
          getSyncBase(),
          ids,
        );

        let headers: Record<string, string>;
        try {
          headers = await buildAuthHeaders(s.chatCap, s.keys.edPriv, 'GET', pathAndQuery);
        } catch {
          break; // signing failure — session likely gone, stop loop
        }
        if (cancelled) break;

        await openEventsStream({
          url,
          headers,
          onEvent: ({ spaceId, objectId, nodeId }) => {
            if (spaceId) dispatchDocChange(spaceId);
            if (objectId) dispatchDocChange(objectId);
            // nodeId is an alias for objectId in some collections; dispatch only if distinct.
            if (nodeId && nodeId !== objectId) dispatchDocChange(nodeId);
          },
          onStatus: emitSseStatus,
          signal: ac.signal,
        });

        if (cancelled || ac.signal.aborted) break;
        // Stream dropped — backoff before reconnect.
        await new Promise<void>((resolve) => setTimeout(resolve, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      emitSseStatus(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, spaceKey]);
}
