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

import { buildAuthHeaders, getEventsUrl } from '@drakkar.software/octovault-sdk';
import { dispatchDocChange, emitSseStatus } from '@drakkar.software/octovault-sdk';
import type { Session } from '@drakkar.software/octovault-sdk';

import { openEventsStream } from './events-stream';

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

        // Build the exact pathAndQuery the server will verify the signature against.
        // Use URLSearchParams so the comma is encoded to %2C on both the signed
        // string and the wire — a normalizing CDN (Cloudflare) would otherwise
        // re-encode a literal comma and break the request signature.
        const base = getEventsUrl();
        const u = new URL(base);
        const params = new URLSearchParams();
        params.set('spaces', ids.join(','));
        u.search = params.toString(); // spaces=sp-a%2Csp-b
        const pathAndQuery = u.pathname + u.search;

        let headers: Record<string, string>;
        try {
          headers = await buildAuthHeaders(s.chatCap, s.keys.edPriv, 'GET', pathAndQuery);
        } catch {
          break; // signing failure — session likely gone, stop loop
        }
        if (cancelled) break;

        await openEventsStream({
          url: u.toString(),
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
