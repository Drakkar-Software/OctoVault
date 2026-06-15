/**
 * OctoVault-specific SSE payload parser for the `/events` endpoint.
 *
 * The generic transport (buildSignedEventsRequest / parseSseFrames /
 * subscribeChanges) now lives in `@drakkar.software/octospaces-sdk`
 * (re-exported through `@drakkar.software/octovault-sdk`).
 *
 * This file contains only the domain-specific `extractChangedIds` parser —
 * the `parse` callback injected into `subscribeChanges` — and its return type.
 */

export interface ChangedIds {
  spaceId?: string;
  objectId?: string;
  nodeId?: string;
}

/**
 * Extract the changed resource ids from the JSON payload of a parsed SSE data line.
 * Whistlers wraps the NATS payload as: { sourceTopic, rawPayload, ... }
 *  - sourceTopic = "octospaces.object.changed.<spaceId>"  (reliable)
 *  - rawPayload.params = { spaceId, objectId?, nodeId? } (best-effort)
 */
export function extractChangedIds(dataJson: string): ChangedIds {
  try {
    const frame = JSON.parse(dataJson) as {
      sourceTopic?: string;
      rawPayload?: unknown;
    };
    const result: ChangedIds = {};

    const TOPIC_PREFIX = 'octospaces.object.changed.';
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
