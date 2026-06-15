/**
 * Tests for OctoVault-specific SSE payload parser.
 *
 * The generic transport tests (buildSignedEventsRequest, parseSseFrames) have
 * been migrated to octospaces-sdk (src/sync/events.test.ts). This file covers
 * only the OctoVault-specific extractChangedIds parser.
 */
import { describe, it, expect } from 'vitest';
import { extractChangedIds } from './events-stream';

// ── extractChangedIds ─────────────────────────────────────────────────────────

describe('extractChangedIds', () => {
  it('extracts spaceId from sourceTopic', () => {
    const data = JSON.stringify({ sourceTopic: 'octovault.object.changed.sp-abc' });
    expect(extractChangedIds(data)).toEqual({ spaceId: 'sp-abc' });
  });

  it('extracts objectId from rawPayload.params (object form)', () => {
    const data = JSON.stringify({
      sourceTopic: 'octovault.object.changed.sp-abc',
      rawPayload: { params: { spaceId: 'sp-abc', objectId: 'obj-1' } },
    });
    expect(extractChangedIds(data)).toEqual({ spaceId: 'sp-abc', objectId: 'obj-1' });
  });

  it('extracts objectId from rawPayload.params (JSON string form)', () => {
    const data = JSON.stringify({
      sourceTopic: 'octovault.object.changed.sp-abc',
      rawPayload: JSON.stringify({ params: { spaceId: 'sp-abc', objectId: 'obj-2', nodeId: 'n-3' } }),
    });
    const ids = extractChangedIds(data);
    expect(ids.spaceId).toBe('sp-abc');
    expect(ids.objectId).toBe('obj-2');
    expect(ids.nodeId).toBe('n-3');
  });

  it('returns empty object for malformed JSON', () => {
    expect(extractChangedIds('not-json')).toEqual({});
  });

  it('returns empty object for empty string', () => {
    expect(extractChangedIds('')).toEqual({});
  });

  it('ignores unknown sourceTopic prefixes', () => {
    const data = JSON.stringify({ sourceTopic: 'other.topic.sp-xyz' });
    expect(extractChangedIds(data)).toEqual({});
  });

  it('returns empty string spaceId when topic suffix is empty', () => {
    // "octovault.object.changed." — trailing dot, zero-length spaceId
    const data = JSON.stringify({ sourceTopic: 'octovault.object.changed.' });
    expect(extractChangedIds(data)).toEqual({ spaceId: '' });
  });

  it('ignores a non-JSON rawPayload string (valid envelope, invalid inner payload)', () => {
    const data = JSON.stringify({
      sourceTopic: 'octovault.object.changed.sp-abc',
      rawPayload: 'not-valid-json',
    });
    const ids = extractChangedIds(data);
    expect(ids.spaceId).toBe('sp-abc');
    expect(ids.objectId).toBeUndefined();
  });
});
