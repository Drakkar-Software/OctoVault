/**
 * Parity tests for OctoVault thin re-export barrels.
 *
 * After the octospaces-sdk 0.23+ extraction, the spaces domain moved to
 * @drakkar.software/starfish-spaces. These tests verify exported names and
 * function availability so a future SDK change fails loudly here rather than
 * silently at app call sites.
 *
 * Note: reference-equality ("same function") checks use starfish-spaces for
 * symbols that moved there; octospaces-sdk 0.26 re-exports some of them but
 * the original reference lives in starfish-spaces.
 */
import { describe, expect, it } from 'vitest';

// ── account-seal ──────────────────────────────────────────────────────────────
// account-seal.ts is kept as a file (imported by stream-bots.ts)
import * as accountSeal from './account-seal';
import * as spacesExports from '@drakkar.software/starfish-spaces';

describe('account-seal re-exports', () => {
  it('exports sealToSelf, unsealFromSelf, sealToRecipient, unsealFromRecipient', () => {
    expect(typeof accountSeal.sealToSelf).toBe('function');
    expect(typeof accountSeal.unsealFromSelf).toBe('function');
    expect(typeof accountSeal.sealToRecipient).toBe('function');
    expect(typeof accountSeal.unsealFromRecipient).toBe('function');
  });

  // sealToSelf / unsealFromSelf moved to starfish-spaces in octospaces-sdk 0.23+.
  it('is parity with starfish-spaces (same function references)', () => {
    expect(accountSeal.sealToSelf).toBe(spacesExports.sealToSelf);
    expect(accountSeal.unsealFromSelf).toBe(spacesExports.unsealFromSelf);
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
    expect(typeof identity.ownerTrustedAdders).toBe('function');
    expect(typeof identity.generateSeedWords).toBe('function');
    expect(typeof identity.isValidSeed).toBe('function');
    expect(typeof identity.fingerprintFromUserId).toBe('function');
  });

  // buildSession / generateSeedWords are wrappers (not the same reference as the raw
  // starfish-spaces functions) — verify they are functions, not reference equality.
  it('buildSession and generateSeedWords are functions', () => {
    expect(typeof identity.buildSession).toBe('function');
    expect(typeof identity.generateSeedWords).toBe('function');
  });

  // sessionFromPersisted moved to starfish-spaces in dk-spaces-sdk 0.31 (no more
  // proxy) — identity.ts adds a wrapper injecting clientOpts. activeAccountOf /
  // rootIdentityOf are direct pass-throughs (no clientOpts needed).
  it('exports sessionFromPersisted, activeAccountOf, rootIdentityOf', () => {
    expect(typeof identity.sessionFromPersisted).toBe('function');
    expect(typeof identity.activeAccountOf).toBe('function');
    expect(typeof identity.rootIdentityOf).toBe('function');
  });

  it('activeAccountOf / rootIdentityOf are the same references as starfish-spaces (pass-through)', () => {
    expect(identity.activeAccountOf).toBe(spacesExports.activeAccountOf);
    expect(identity.rootIdentityOf).toBe(spacesExports.rootIdentityOf);
  });
});

// ── pairing ───────────────────────────────────────────────────────────────────
// pairing.ts is a NEW file — dk-spaces-sdk 0.31 dropped its device-pairing proxy;
// startDevicePairing/completeDevicePairing now come straight from starfish-spaces,
// wrapped here for the confirmUnpinnedRoot decision + the app's own QR prefix.
import * as pairing from './pairing';

describe('pairing re-exports', () => {
  it('exports startDevicePairing and completeDevicePairing as functions', () => {
    expect(typeof pairing.startDevicePairing).toBe('function');
    expect(typeof pairing.completeDevicePairing).toBe('function');
  });

  it('PAIR_PREFIX is the app-specific octovault-pair: prefix', () => {
    expect(pairing.PAIR_PREFIX).toBe('octovault-pair:');
  });
});

// ── space-encryptor ───────────────────────────────────────────────────────────
// space-encryptor.ts's exports were hoisted into the barrel (file itself removed);
// import from the barrel to guard re-export coverage
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

  // SpaceAccessError moved to starfish-spaces in octospaces-sdk 0.23+.
  it('SpaceAccessError is parity with starfish-spaces', () => {
    expect(SpaceAccessError).toBe(spacesExports.SpaceAccessError);
  });
});

// ── pull-cache ────────────────────────────────────────────────────────────────
// pull-cache.ts still exists (vendored createKvPullCache wrapper) and is re-exported
// from the barrel; import from the barrel to guard re-export coverage
import { pullCache, PULL_CACHE_MAX_AGE_MS } from '../index';

describe('pull-cache re-exports', () => {
  it('exports pullCache function and PULL_CACHE_MAX_AGE_MS', () => {
    expect(typeof pullCache).toBe('function');
    expect(typeof PULL_CACHE_MAX_AGE_MS).toBe('number');
    expect(PULL_CACHE_MAX_AGE_MS).toBeGreaterThan(0);
  });
});
