import { describe, expect, it } from 'vitest';
import { formatBytes, computeInlineImageSize } from './attachment-utils';

describe('formatBytes', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(35635)).toBe('34.8 KB'); // ftx.png in the original bug report
    expect(formatBytes(1024 * 1023)).toBe('1023.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
  });
});

describe('computeInlineImageSize', () => {
  const MAX_H = 320;
  const COL = 400; // typical column width

  it('returns null before natural size is known (shows placeholder — the original regression)', () => {
    // Regression guard: returning {0,0} made the image invisible. null = keep placeholder.
    expect(computeInlineImageSize(null, COL, MAX_H)).toBeNull();
  });

  it('returns null before boxWidth is measured (onLayout not yet fired)', () => {
    expect(computeInlineImageSize({ w: 120, h: 80 }, null, MAX_H)).toBeNull();
  });

  it('never upscales a small image — scale capped at 1', () => {
    // 120×80 image in a 400px column: must stay at 120×80, not stretch to 400px
    const s = computeInlineImageSize({ w: 120, h: 80 }, COL, MAX_H);
    expect(s).toEqual({ width: 120, height: 80 });
  });

  it('scales down a wide image to fit the column', () => {
    // 1200×800 in 400px column: scale = 400/1200 = 0.333
    const s = computeInlineImageSize({ w: 1200, h: 800 }, COL, MAX_H);
    expect(s).toEqual({ width: 400, height: 267 });
  });

  it('caps a tall portrait at maxHeight without wide letterbox', () => {
    // 390×844 portrait: scale = min(1, 400/390, 320/844) = min(1, 1.026, 0.379) = 0.379
    const s = computeInlineImageSize({ w: 390, h: 844 }, COL, MAX_H);
    expect(s!.height).toBe(MAX_H);
    expect(s!.width).toBeLessThanOrEqual(390); // narrower than column, hugs portrait
  });

  it('handles a square image', () => {
    // 512×512 in 400px column: scale = min(1, 400/512, 320/512) = 0.625
    const s = computeInlineImageSize({ w: 512, h: 512 }, COL, MAX_H);
    expect(s!.width).toBe(s!.height); // stays square
    expect(s!.width).toBeLessThanOrEqual(COL);
    expect(s!.height).toBeLessThanOrEqual(MAX_H);
  });

  it('rejects premature onLayout width=0 by returning null', () => {
    // Callers pass 0 from a filtered onLayout; null keeps the placeholder visible
    expect(computeInlineImageSize({ w: 400, h: 300 }, 0, MAX_H)).toBeNull();
  });
});
