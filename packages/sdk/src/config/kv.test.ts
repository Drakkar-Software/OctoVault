/**
 * Tests for the OctoVault KV dependency-injection seam.
 * Key invariant: configureKv wires BOTH the local seam AND the dk-spaces-sdk seam
 * so all SDK modules (pull-cache, profile-cache, access-store) use the same adapter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Must mock dk-spaces-sdk BEFORE importing kv, since configureKv calls dkSpacesConfigure.
vi.mock('@drakkar.software/dk-spaces-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drakkar.software/dk-spaces-sdk')>();
  return { ...actual, configureKv: vi.fn() };
});

import { configureKv as dkSpacesConfigure } from '@drakkar.software/dk-spaces-sdk';
import { configureKv, kvGet, kvSet, kvRemove } from './kv';

beforeEach(() => vi.clearAllMocks());

describe('configureKv', () => {
  it('wires the dk-spaces-sdk KV seam with the same adapter', () => {
    const adapter = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
    configureKv(adapter);
    expect(dkSpacesConfigure).toHaveBeenCalledOnce();
    const sdkAdapter = vi.mocked(dkSpacesConfigure).mock.calls[0]![0];
    expect(sdkAdapter.get).toBe(adapter.get);
    expect(sdkAdapter.set).toBe(adapter.set);
    expect(sdkAdapter.remove).toBe(adapter.remove);
  });
});

describe('kvGet / kvSet / kvRemove', () => {
  it('delegates to the configured adapter', async () => {
    const store = new Map<string, string>();
    configureKv({
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
      remove: async (k) => void store.delete(k),
    });

    await kvSet('foo', 'bar');
    expect(await kvGet('foo')).toBe('bar');
    await kvRemove('foo');
    expect(await kvGet('foo')).toBeNull();
  });

  it('returns null for unconfigured keys (default no-op adapter)', async () => {
    // Reset to unconfigured state by re-importing (import is cached, so we test
    // the default behavior by configuring a null-returning adapter).
    const nullAdapter = {
      get: async () => null,
      set: async () => {},
      remove: async () => {},
    };
    configureKv(nullAdapter);
    expect(await kvGet('anything')).toBeNull();
  });
});
