import { describe, it, expect } from 'vitest';
import { buildSignedEventsRequest, parseSseFrames, extractChangedIds } from './events-stream';

// ── buildSignedEventsRequest ──────────────────────────────────────────────────
//
// The helper must:
//   1. Strip the syncBase mount prefix (e.g. "/sync") from the SIGNED path so
//      the signature matches the path the origin verifies after nginx strips it —
//      mirroring how starfish-client's /pull signs applyNamespace(path) without
//      the baseUrl prefix.
//   2. Encode the comma between space ids as %2C (URLSearchParams) so a
//      normalizing CDN (Cloudflare) cannot re-encode a literal comma and break
//      the signature.
//   3. Keep the full mount in the fetched `url` so nginx can route the request.

describe('buildSignedEventsRequest', () => {
  // ── mount-strip cases ──────────────────────────────────────────────────────

  it('strips the syncBase mount prefix from the signed pathAndQuery (production layout)', () => {
    const { url, pathAndQuery } = buildSignedEventsRequest(
      'https://h/sync/v1/octovault/events',
      'https://h/sync',
      ['sp-a', 'sp-b'],
    );
    // signed path must NOT include "/sync"
    expect(pathAndQuery).toBe('/v1/octovault/events?spaces=sp-a%2Csp-b');
    // fetch URL keeps the mount so nginx can route it
    expect(url).toBe('https://h/sync/v1/octovault/events?spaces=sp-a%2Csp-b');
  });

  it('is a no-op strip when syncBase has no pathname (local dev)', () => {
    const { url, pathAndQuery } = buildSignedEventsRequest(
      'http://localhost:8787/events',
      'http://localhost:8787',
      ['sp-x'],
    );
    expect(pathAndQuery).toBe('/events?spaces=sp-x');
    expect(url).toBe('http://localhost:8787/events?spaces=sp-x');
  });

  it('is a no-op strip when syncBase has namespace prefix but no mount (ns-only layout)', () => {
    const { url, pathAndQuery } = buildSignedEventsRequest(
      'https://h/v1/octovault/events',
      'https://h',
      ['sp-1', 'sp-2'],
    );
    expect(pathAndQuery).toBe('/v1/octovault/events?spaces=sp-1%2Csp-2');
    expect(url).toBe('https://h/v1/octovault/events?spaces=sp-1%2Csp-2');
  });

  it('handles a trailing slash in syncBase without double-stripping', () => {
    const { pathAndQuery } = buildSignedEventsRequest(
      'https://h/sync/v1/octovault/events',
      'https://h/sync/',
      ['sp-a'],
    );
    expect(pathAndQuery).toBe('/v1/octovault/events?spaces=sp-a');
  });

  // ── comma encoding (%2C contract) ─────────────────────────────────────────

  it('encodes the comma between space ids as %2C', () => {
    const { pathAndQuery } = buildSignedEventsRequest(
      'https://sync.example.com/v1/octovault/events',
      'https://sync.example.com',
      ['sp-a', 'sp-b'],
    );
    expect(pathAndQuery).toBe('/v1/octovault/events?spaces=sp-a%2Csp-b');
  });

  it('single space id has no comma and no encoding', () => {
    const { pathAndQuery } = buildSignedEventsRequest(
      'https://sync.example.com/v1/octovault/events',
      'https://sync.example.com',
      ['sp-x'],
    );
    expect(pathAndQuery).toBe('/v1/octovault/events?spaces=sp-x');
  });

  it('server decodes %2C back to comma (membership split is unaffected)', () => {
    const { url } = buildSignedEventsRequest(
      'https://h.example/v1/octovault/events',
      'https://h.example',
      ['sp-a', 'sp-b', 'sp-c'],
    );
    expect(new URL(url).searchParams.get('spaces')).toBe('sp-a,sp-b,sp-c');
  });

  it('signed and fetched URLs are CDN-normalization-proof (no re-encodable literal comma)', () => {
    const { pathAndQuery } = buildSignedEventsRequest(
      'https://sync.example.com/v1/octovault/events',
      'https://sync.example.com',
      ['sp-1', 'sp-2'],
    );
    // The %2C form is already normalised — a CDN re-encoding comma→%2C is a no-op.
    expect(pathAndQuery.replace(/,/g, '%2C')).toBe(pathAndQuery);
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
