import { describe, expect, it } from 'vitest';
import { formatBytes, inlineImageConstraints } from './attachment-utils';

describe('formatBytes', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(35635)).toBe('34.8 KB'); // ftx.png in the bug report
    expect(formatBytes(1024 * 1023)).toBe('1023.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
  });
});

describe('inlineImageConstraints', () => {
  const MAX_H = 320;
  const MIN_H = 200;

  it('returns full-width placeholder before natural size is known', () => {
    const s = inlineImageConstraints(null, MAX_H, MIN_H);
    expect(s).toEqual({ width: '100%', height: MIN_H });
    // maxWidth must be absent — before onLoad fires, the container stays full-width
    // so the block is visible (the core regression: imageSize={0,0} made it invisible)
    expect(s.maxWidth).toBeUndefined();
  });

  it('caps the container at natural pixel width — never upscales a small image', () => {
    const s = inlineImageConstraints({ w: 120, h: 80 }, MAX_H, MIN_H);
    // maxWidth on the container = natural width → Yoga clamps to min(column, 120)
    expect(s.maxWidth).toBe(120);
    expect(s.width).toBe('100%');
    // No explicit height — aspect ratio drives it
    expect(s.height).toBeUndefined();
  });

  it('preserves the correct aspect ratio for a landscape image', () => {
    const s = inlineImageConstraints({ w: 1200, h: 800 }, MAX_H, MIN_H);
    expect(s.aspectRatio).toBeCloseTo(1200 / 800);
    expect(s.maxWidth).toBe(1200);
    expect(s.maxHeight).toBe(MAX_H);
  });

  it('applies maxHeight for a tall portrait (no wide letterbox)', () => {
    // A phone screenshot: narrow but very tall — should be capped by maxHeight
    const s = inlineImageConstraints({ w: 390, h: 844 }, MAX_H, MIN_H);
    expect(s.maxHeight).toBe(MAX_H);
    expect(s.maxWidth).toBe(390);
    expect(s.aspectRatio).toBeCloseTo(390 / 844);
  });

  it('handles a square image', () => {
    const s = inlineImageConstraints({ w: 512, h: 512 }, MAX_H, MIN_H);
    expect(s.aspectRatio).toBe(1);
    expect(s.maxWidth).toBe(512);
  });

  it('handles a wide image larger than typical column width', () => {
    // Image wider than screen: maxWidth stays at natural.w; Yoga clamps to column
    const s = inlineImageConstraints({ w: 4000, h: 2000 }, MAX_H, MIN_H);
    expect(s.maxWidth).toBe(4000);
    expect(s.aspectRatio).toBeCloseTo(2);
    expect(s.maxHeight).toBe(MAX_H);
  });
});
