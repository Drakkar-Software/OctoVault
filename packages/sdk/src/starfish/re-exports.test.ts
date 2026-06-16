/**
 * Parity tests for OctoVault thin re-export barrels.
 *
 * These files contain no local logic — they re-export from octospaces-sdk.
 * These tests pin the exported names and any critical constants so a future SDK
 * change that drops or renames an export fails loudly here rather than silently
 * at the app call sites.
 */
import { describe, expect, it } from 'vitest';

// ── account-seal ──────────────────────────────────────────────────────────────
// account-seal.ts is kept as a file (imported by stream-bots.ts)
import * as accountSeal from './account-seal';
import * as sdkAccountSeal from '@drakkar.software/octospaces-sdk';

describe('account-seal re-exports', () => {
  it('exports sealToSelf, unsealFromSelf, sealToRecipient, unsealFromRecipient', () => {
    expect(typeof accountSeal.sealToSelf).toBe('function');
    expect(typeof accountSeal.unsealFromSelf).toBe('function');
    expect(typeof accountSeal.sealToRecipient).toBe('function');
    expect(typeof accountSeal.unsealFromRecipient).toBe('function');
  });

  it('is parity with octospaces-sdk (same function references)', () => {
    expect(accountSeal.sealToSelf).toBe(sdkAccountSeal.sealToSelf);
    expect(accountSeal.unsealFromSelf).toBe(sdkAccountSeal.unsealFromSelf);
  });
});

// ── identity ──────────────────────────────────────────────────────────────────
// identity.ts is kept as a file (imported by stream-bots.ts)
import * as identity from './identity';

describe('identity re-exports', () => {
  it('exports all session helpers', () => {
    expect(typeof identity.buildSession).toBe('function');
    expect(typeof identity.buildLinkedSession).toBe('function');
    expect(typeof identity.deriveSession).toBe('function');
    expect(typeof identity.rootIdentityOf).toBe('function');
    expect(typeof identity.ownerTrustedAdders).toBe('function');
    expect(typeof identity.generateSeedWords).toBe('function');
    expect(typeof identity.isValidSeed).toBe('function');
    expect(typeof identity.fingerprintFromUserId).toBe('function');
  });

  it('is parity with octospaces-sdk', () => {
    expect(identity.buildSession).toBe(sdkAccountSeal.buildSession);
    expect(identity.generateSeedWords).toBe(sdkAccountSeal.generateSeedWords);
  });
});

// ── space-encryptor ───────────────────────────────────────────────────────────
// space-encryptor.ts deleted — hoisted into barrel; import from barrel to guard re-export coverage
import {
  getNodeAccess,
  clearNodeAccessCache,
  getSpaceClient,
  buildEncryptor,
  ownerEnsureKeyring,
  SpaceAccessError,
} from '../index';

describe('space-encryptor re-exports', () => {
  it('exports the node-access resolver functions', () => {
    expect(typeof getNodeAccess).toBe('function');
    expect(typeof clearNodeAccessCache).toBe('function');
    expect(typeof getSpaceClient).toBe('function');
    expect(typeof buildEncryptor).toBe('function');
    expect(typeof ownerEnsureKeyring).toBe('function');
  });

  it('SpaceAccessError is parity with SDK', () => {
    expect(SpaceAccessError).toBe(sdkAccountSeal.SpaceAccessError);
  });
});

// ── pull-cache ────────────────────────────────────────────────────────────────
// pull-cache.ts deleted — hoisted into barrel; import from barrel to guard re-export coverage
import { pullCache, PULL_CACHE_MAX_AGE_MS } from '../index';

describe('pull-cache re-exports', () => {
  it('exports pullCache function and PULL_CACHE_MAX_AGE_MS', () => {
    expect(typeof pullCache).toBe('function');
    expect(typeof PULL_CACHE_MAX_AGE_MS).toBe('number');
    expect(PULL_CACHE_MAX_AGE_MS).toBeGreaterThan(0);
  });
});

