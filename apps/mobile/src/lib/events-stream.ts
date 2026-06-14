/**
 * Client-side SSE consumer for the `/events` endpoint.
 *
 * Two pure, unit-tested helpers (parseSseFrames + extractChangedIds) are
 * separated from the streaming fetch so they can run under Node vitest.
 * The actual stream is opened by openEventsStream, called from
 * useEventsStream which mounts once inside SpacesProvider.
 */

export interface ChangedIds {
  spaceId?: string;
  objectId?: string;
  nodeId?: string;
}

/**
 * Incrementally parse SSE frames from a raw text chunk.
 * `carry` is the leftover text from the previous chunk (incomplete frame).
 * Returns the data payloads of completed frames and the new carry.
 */
export function parseSseFrames(
  chunk: string,
  carry: string,
): { events: string[]; carry: string } {
  // Normalize line endings per SSE spec (§10.1, WHATWG).
  const text = (carry + chunk).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Frames are delimited by blank lines (\n\n).
  const parts = text.split('\n\n');
  const events: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const dataLines: string[] = [];
    for (const line of parts[i].split('\n')) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      // id:, event:, and : (comment/heartbeat) lines are intentionally skipped.
    }
    if (dataLines.length > 0) events.push(dataLines.join('\n'));
  }
  // The last part may be incomplete — hold it as the new carry.
  return { events, carry: parts[parts.length - 1] };
}

/**
 * Extract the changed resource ids from the JSON payload of a parsed SSE data line.
 * Whistlers wraps the NATS payload as: { sourceTopic, rawPayload, ... }
 *  - sourceTopic = "octovault.object.changed.<spaceId>"  (reliable)
 *  - rawPayload.params = { spaceId, objectId?, nodeId? } (best-effort)
 */
export function extractChangedIds(dataJson: string): ChangedIds {
  try {
    const frame = JSON.parse(dataJson) as {
      sourceTopic?: string;
      rawPayload?: unknown;
    };
    const result: ChangedIds = {};

    const TOPIC_PREFIX = 'octovault.object.changed.';
    if (typeof frame.sourceTopic === 'string' && frame.sourceTopic.startsWith(TOPIC_PREFIX)) {
      result.spaceId = frame.sourceTopic.slice(TOPIC_PREFIX.length);
    }

    // rawPayload may be a parsed object or a JSON string depending on the Whistlers version.
    let params: Record<string, string> | null = null;
    const raw = frame.rawPayload;
    if (raw && typeof raw === 'object') {
      params = ((raw as Record<string, unknown>).params as Record<string, string>) ?? null;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as { params?: Record<string, string> };
        params = parsed.params ?? null;
      } catch { /* non-JSON rawPayload — ignore */ }
    }
    if (params) {
      if (!result.spaceId && params.spaceId) result.spaceId = params.spaceId;
      if (params.objectId) result.objectId = params.objectId;
      if (params.nodeId) result.nodeId = params.nodeId;
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Build the fetch URL and the signed `pathAndQuery` for the /events SSE request.
 *
 * The signed path drops the `getSyncBase()` mount prefix (e.g. "/sync") because
 * the deployment's nginx strips that mount before the origin verifies the request
 * signature — so the signed path must match the un-prefixed path the origin sees,
 * exactly as `starfish-client`'s /pull signs `applyNamespace(path)` without the
 * base-URL prefix.  The comma between space ids is encoded to %2C (URLSearchParams)
 * so a normalising CDN (Cloudflare) cannot re-encode a literal comma and break the
 * signature; the fetch URL retains the full mount path so nginx can route it.
 *
 * @param eventsUrl  Full events endpoint URL (from `getEventsUrl()`).
 * @param syncBase   Sync server base URL (from `getSyncBase()`), used to derive
 *                   the mount prefix to strip.
 * @param spaceIds   Space ids to subscribe to.
 * @returns `url` — the full URL to fetch; `pathAndQuery` — the mount-stripped path
 *          to include in the Ed25519 signature.
 */
export function buildSignedEventsRequest(
  eventsUrl: string,
  syncBase: string,
  spaceIds: string[],
): { url: string; pathAndQuery: string } {
  const u = new URL(eventsUrl);
  const params = new URLSearchParams();
  params.set('spaces', spaceIds.join(','));
  u.search = params.toString(); // spaces=sp-a%2Csp-b

  // Strip the sync-base mount path (e.g. "/sync") from the signed path so it
  // matches the path the origin sees after nginx strips the mount prefix.
  let basePath = '';
  try {
    basePath = new URL(syncBase).pathname.replace(/\/+$/, '');
  } catch {
    /* relative base — no prefix to strip */
  }
  const signedPath =
    basePath && u.pathname.startsWith(basePath)
      ? u.pathname.slice(basePath.length)
      : u.pathname;

  return { url: u.toString(), pathAndQuery: signedPath + u.search };
}

/**
 * Open one SSE stream to `url` using header-capable fetch (EventSource cannot
 * set Authorization). Reads frames until the signal aborts or the stream ends.
 * Calls onStatus(true) on first read, onStatus(false) on exit.
 */
export async function openEventsStream(opts: {
  url: string;
  headers: Record<string, string>;
  onEvent: (ids: ChangedIds) => void;
  onStatus: (up: boolean) => void;
  signal: AbortSignal;
}): Promise<void> {
  const { url, headers, onEvent, onStatus, signal } = opts;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { ...headers, Accept: 'text/event-stream' },
      signal,
    });
  } catch {
    return; // network error or abort — caller handles reconnect
  }
  if (!res.ok || !res.body) return;

  onStatus(true);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const { events, carry: next } = parseSseFrames(chunk, carry);
      carry = next;
      for (const dataJson of events) {
        onEvent(extractChangedIds(dataJson));
      }
    }
  } finally {
    onStatus(false);
    reader.releaseLock();
  }
}
