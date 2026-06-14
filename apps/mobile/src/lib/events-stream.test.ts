import { describe, it, expect } from 'vitest';
import { parseSseFrames, extractChangedIds } from './events-stream';

// ── /events query serialization (CDN-normalization safety) ────────────────────
//
// The signed pathAndQuery MUST use %2C for the comma so a normalizing CDN
// (Cloudflare) doesn't re-encode a literal comma and break the signature.
// This tests the URLSearchParams approach used in useEventsStream.

describe('events query URL-encoding', () => {
  function buildEventsPathAndQuery(base: string, spaceIds: string[]): string {
    const u = new URL(base);
    const params = new URLSearchParams();
    params.set('spaces', spaceIds.join(','));
    u.search = params.toString();
    return u.pathname + u.search;
  }

  it('encodes the comma between space ids as %2C', () => {
    const pq = buildEventsPathAndQuery('https://sync.example.com/v1/octovault/events', ['sp-a', 'sp-b']);
    expect(pq).toBe('/v1/octovault/events?spaces=sp-a%2Csp-b');
  });

  it('single space id has no comma and no encoding', () => {
    const pq = buildEventsPathAndQuery('https://sync.example.com/v1/octovault/events', ['sp-x']);
    expect(pq).toBe('/v1/octovault/events?spaces=sp-x');
  });

  it('server decodes %2C back to comma (membership split is unaffected)', () => {
    const pq = buildEventsPathAndQuery('https://h.example/v1/octovault/events', ['sp-a', 'sp-b', 'sp-c']);
    const u = new URL('https://h.example' + pq);
    expect(u.searchParams.get('spaces')).toBe('sp-a,sp-b,sp-c');
  });

  it('signed and fetched URLs are byte-identical (CDN cannot break the signature)', () => {
    const ids = ['sp-1', 'sp-2'];
    const pq = buildEventsPathAndQuery('https://sync.example.com/v1/octovault/events', ids);
    // Simulate CDN re-encoding a literal comma: if we naively did join(',') with
    // no URLSearchParams the CDN would turn ',' -> '%2C', breaking the signature.
    // The %2C form is already normalized — re-encoding is a no-op.
    const cdnNormalized = pq.replace(/,/g, '%2C');
    expect(cdnNormalized).toBe(pq);
  });
});

// ── parseSseFrames ────────────────────────────────────────────────────────────

describe('parseSseFrames', () => {
  it('parses a single complete frame', () => {
    const { events, carry } = parseSseFrames('data: {"hello":1}\n\n', '');
    expect(events).toEqual(['{"hello":1}']);
    expect(carry).toBe('');
  });

  it('returns empty events with incomplete frame as carry', () => {
    const { events, carry } = parseSseFrames('data: partia', '');
    expect(events).toEqual([]);
    expect(carry).toBe('data: partia');
  });

  it('assembles frames split across chunks', () => {
    const { events: e1, carry: c1 } = parseSseFrames('data: {"a":1}\n', '');
    expect(e1).toEqual([]);
    const { events: e2, carry: c2 } = parseSseFrames('\n', c1);
    expect(e2).toEqual(['{"a":1}']);
    expect(c2).toBe('');
  });

  it('parses multiple frames from one chunk', () => {
    const chunk = 'data: one\n\ndata: two\n\n';
    const { events } = parseSseFrames(chunk, '');
    expect(events).toEqual(['one', 'two']);
  });

  it('skips event:, id:, and heartbeat comment lines', () => {
    const chunk = 'id: 123\nevent: update\ndata: payload\n: heartbeat\n\n';
    const { events } = parseSseFrames(chunk, '');
    expect(events).toEqual(['payload']);
  });

  it('normalises \\r\\n line endings', () => {
    const chunk = 'data: ok\r\n\r\n';
    const { events } = parseSseFrames(chunk, '');
    expect(events).toEqual(['ok']);
  });

  it('carries leftover across calls', () => {
    const { events: e1, carry: c1 } = parseSseFrames('data: start', '');
    const { events: e2 } = parseSseFrames('\n\n', c1);
    expect(e1).toEqual([]);
    expect(e2).toEqual(['start']);
  });

  it('joins multiple data: lines within one frame with newline (SSE spec)', () => {
    const chunk = 'data: line1\ndata: line2\n\n';
    const { events } = parseSseFrames(chunk, '');
    expect(events).toEqual(['line1\nline2']);
  });

  it('skips frames with no data: line', () => {
    const chunk = 'id: 123\nevent: ping\n\n';
    const { events } = parseSseFrames(chunk, '');
    expect(events).toEqual([]);
  });
});

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
