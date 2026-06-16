import { describe, it, expect } from 'vitest';
import { commentsDocId, readKey } from './comments-paths';

// The server validates every URL path segment against this regex.
// Verified in both the Python (dev-sync, starfish_server/router/helpers.py:42)
// and TypeScript (helpers.ts:21) server implementations.
const SAFE_PARAM = /^[a-zA-Z0-9._:@-]+$/;

const PAGE_ID = 'obj-abc123def456';
const BLOCK_ID = 'blk-7890abcdef01';

describe('commentsDocId', () => {
  it('contains only SAFE_PARAM-allowed characters', () => {
    // Every character in the generated segment must be accepted by the server's
    // path-segment validator — the root cause of the original "comment disappears"
    // bug was that `~` is not in SAFE_PARAM.
    expect(SAFE_PARAM.test(commentsDocId(PAGE_ID))).toBe(true);
  });

  it('does not contain a tilde', () => {
    expect(commentsDocId(PAGE_ID)).not.toContain('~');
  });

  it('derives from the page id', () => {
    expect(commentsDocId(PAGE_ID)).toContain(PAGE_ID);
  });
});

describe('readKey', () => {
  it('contains only SAFE_PARAM-allowed characters', () => {
    // readKey is a local KV key (not a server path), but keeping it clean avoids
    // future confusion if it ever reaches a URL.
    expect(SAFE_PARAM.test(readKey(PAGE_ID, BLOCK_ID))).toBe(true);
  });

  it('does not contain a tilde', () => {
    expect(readKey(PAGE_ID, BLOCK_ID)).not.toContain('~');
  });

  it('derives from both page id and block id', () => {
    const k = readKey(PAGE_ID, BLOCK_ID);
    expect(k).toContain(PAGE_ID);
    expect(k).toContain(BLOCK_ID);
  });

  it('is distinct for different (page, block) pairs', () => {
    expect(readKey('obj-aaa', 'blk-111')).not.toBe(readKey('obj-aaa', 'blk-222'));
    expect(readKey('obj-aaa', 'blk-111')).not.toBe(readKey('obj-bbb', 'blk-111'));
  });
});
