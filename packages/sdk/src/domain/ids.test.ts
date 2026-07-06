/**
 * Parity + characterization tests for domain/ids (thin re-export from starfish-protocol).
 * Pins randomId/roomSlug behavior so any future SDK drift is caught immediately.
 */
import { describe, it, expect } from 'vitest';
import { randomId, roomSlug } from './ids';
import { randomId as sdkRandomId, slugify as sdkRoomSlug } from '@drakkar.software/starfish-protocol';

describe('randomId', () => {
  it('returns a 32-char lowercase hex string', () => {
    expect(randomId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns different values on each call', () => {
    expect(randomId()).not.toBe(randomId());
  });

  it('is parity with octospaces-sdk randomId (same format)', () => {
    expect(randomId().length).toBe(sdkRandomId().length);
    expect(randomId()).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('roomSlug', () => {
  it('lowercases input', () => {
    expect(roomSlug('General')).toBe('general');
  });

  it('maps non-alphanumeric runs to a single hyphen', () => {
    expect(roomSlug('Q&A')).toBe('q-a');
    expect(roomSlug('foo  bar')).toBe('foo-bar');
  });

  it('trims leading and trailing hyphens', () => {
    expect(roomSlug('-hello-')).toBe('hello');
  });

  it('caps at 40 characters', () => {
    expect(roomSlug('a'.repeat(50)).length).toBe(40);
  });

  it('falls back to "item" for empty or all-special input', () => {
    expect(roomSlug('')).toBe('item');
    expect(roomSlug('日本語')).toBe('item');
    expect(roomSlug('---')).toBe('item');
  });

  it('is parity with octospaces-sdk roomSlug (identical output)', () => {
    const cases = ['General', 'Q&A', 'C++', 'café', 'foo  bar', '', '日本語', 'a'.repeat(50)];
    for (const input of cases) {
      expect(roomSlug(input)).toBe(sdkRoomSlug(input));
    }
  });
});
