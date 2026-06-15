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

// ── pairing ───────────────────────────────────────────────────────────────────
import { PAIR_PREFIX } from './pairing';

describe('pairing re-exports', () => {
  it('PAIR_PREFIX equals "octospaces-pair:" (migrated from octovault-pair:)', () => {
    // Pin the current value — changing it would break existing paired devices.
    expect(PAIR_PREFIX).toBe('octospaces-pair:');
  });

  it('PAIR_PREFIX does NOT equal the old octovault prefix (migration complete)', () => {
    expect(PAIR_PREFIX).not.toBe('octovault-pair:');
  });
});

// ── identity ──────────────────────────────────────────────────────────────────
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
import * as spaceEncryptor from './space-encryptor';

describe('space-encryptor re-exports', () => {
  it('exports the node-access resolver functions', () => {
    expect(typeof spaceEncryptor.getNodeAccess).toBe('function');
    expect(typeof spaceEncryptor.buildNodeAccess).toBe('function');
    expect(typeof spaceEncryptor.clearNodeAccessCache).toBe('function');
    expect(typeof spaceEncryptor.getSpaceClient).toBe('function');
    expect(typeof spaceEncryptor.openEncryptor).toBe('function');
    expect(typeof spaceEncryptor.buildEncryptor).toBe('function');
    expect(typeof spaceEncryptor.ownerEnsureKeyring).toBe('function');
  });

  it('SpaceAccessError is parity with SDK', () => {
    expect(spaceEncryptor.SpaceAccessError).toBe(sdkAccountSeal.SpaceAccessError);
  });
});

// ── pull-cache ────────────────────────────────────────────────────────────────
import * as pullCache from './pull-cache';

describe('pull-cache re-exports', () => {
  it('exports pullCache function and PULL_CACHE_MAX_AGE_MS', () => {
    expect(typeof pullCache.pullCache).toBe('function');
    expect(typeof pullCache.PULL_CACHE_MAX_AGE_MS).toBe('number');
    expect(pullCache.PULL_CACHE_MAX_AGE_MS).toBeGreaterThan(0);
  });
});

// ── profile-cache ─────────────────────────────────────────────────────────────
import * as profileCache from './profile-cache';

describe('profile-cache re-exports', () => {
  it('exports cacheProfile and loadCachedProfile', () => {
    expect(typeof profileCache.cacheProfile).toBe('function');
    expect(typeof profileCache.loadCachedProfile).toBe('function');
  });
});
