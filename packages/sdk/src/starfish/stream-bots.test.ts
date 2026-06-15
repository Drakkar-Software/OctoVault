/**
 * Tests for OctoVault stream-bots: openStreamBotCredential handles both
 * the sealed path (current) and the legacy plaintext path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./account-seal', () => ({
  unsealFromSelf: vi.fn(),
}));

import { unsealFromSelf } from './account-seal';
import { openStreamBotCredential, type StreamBotCredential } from './stream-bots';
import type { Session } from './identity';
import type { SealedBlob } from './account-seal';

const FAKE_SESSION = {} as Session;

const CREDENTIAL: StreamBotCredential = {
  token: 'tok-abc',
  endpoint: 'https://example.com/push',
  signPath: '/v1/push/spaces/sp-abc/stream',
};

beforeEach(() => vi.clearAllMocks());

describe('openStreamBotCredential', () => {
  it('returns a legacy plaintext credential as-is (has a token string)', async () => {
    // Legacy credentials were stored as a plain StreamBotCredential object (not sealed).
    const result = await openStreamBotCredential(FAKE_SESSION, CREDENTIAL);
    expect(result).toBe(CREDENTIAL); // same reference — no unseal
    expect(unsealFromSelf).not.toHaveBeenCalled();
  });

  it('unseals a sealed credential and parses the JSON result', async () => {
    const sealed: SealedBlob = { iv: 'iv', ct: 'ct', tag: 'tag' } as never;
    vi.mocked(unsealFromSelf).mockResolvedValue(JSON.stringify(CREDENTIAL));
    const result = await openStreamBotCredential(FAKE_SESSION, sealed);
    expect(unsealFromSelf).toHaveBeenCalledWith(FAKE_SESSION, sealed);
    expect(result).toEqual(CREDENTIAL);
  });

  it('sealed path: passes the session to unsealFromSelf', async () => {
    const fakeSession = { userId: 'u-owner' } as Session;
    const sealed: SealedBlob = { iv: 'iv', ct: 'ct', tag: 'tag' } as never;
    vi.mocked(unsealFromSelf).mockResolvedValue(JSON.stringify(CREDENTIAL));
    await openStreamBotCredential(fakeSession, sealed);
    expect(vi.mocked(unsealFromSelf).mock.calls[0]![0]).toBe(fakeSession);
  });

  it('sealed path: preserves optional expiresAt field', async () => {
    const sealed: SealedBlob = { iv: 'iv', ct: 'ct', tag: 'tag' } as never;
    const withExpiry = { ...CREDENTIAL, expiresAt: 1700000000 };
    vi.mocked(unsealFromSelf).mockResolvedValue(JSON.stringify(withExpiry));
    const result = await openStreamBotCredential(FAKE_SESSION, sealed);
    expect(result.expiresAt).toBe(1700000000);
  });
});
