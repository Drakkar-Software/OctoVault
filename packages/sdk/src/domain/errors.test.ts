import { describe, expect, it } from 'vitest';
import { SpaceAccessError } from '@drakkar.software/starfish-spaces';

import { classifyError } from './errors';

/** The literal messages `starfish-keyring` and `starfish-wal` throw. If either
 *  package reworks its copy, these break — which is the point: `classifyError`
 *  is a message-matcher, and a silent miss would downgrade a crypto failure to
 *  `unknown` and hide the recovery UI. */
const CRYPTO_MESSAGES = [
  'Decryption failed: payload may be tampered or epoch CEK is wrong',
  'Failed to unwrap CEK: AES-GCM authentication failed',
  'Encrypted payload is too short',
  'Keyring is malformed (missing epochs/currentEpoch) — degraded read',
  'Epoch 3 not found in keyring',
  'WalDocument: author signature invalid (ts=17)',
  'WalDocument: unauthorized writer abc123 (ts=17)',
  'WalDocument: malformed op-batch (ts=17)',
  'WalDocument: envelope author/element author mismatch (ts=17)',
  'WalDocument: snapshot producedBy/author mismatch',
  // Raised by starfish-spaces' `openEncryptor` when `createKeyringEncryptor`
  // rejects — i.e. the userId-vs-edPub trusted-adder mismatch. It arrives as a
  // `SpaceAccessError`, but it is the trigger the trust-bypass card exists for,
  // so it MUST classify as crypto or that recovery path becomes unreachable.
  "You're not a recipient of this node's keyring — ask the owner to invite you.",
];

const NETWORK_MESSAGES = [
  'Failed to fetch',
  'Network request failed',
  'fetch failed',
  'Load failed',
  'ECONNREFUSED 127.0.0.1:8787',
  'timeout of 12000ms exceeded',
];

describe('classifyError', () => {
  it('classifies the crypto messages the keyring and WAL layers throw', () => {
    for (const m of CRYPTO_MESSAGES) expect(classifyError(new Error(m))).toBe('crypto');
  });

  it('classifies transport failures as network', () => {
    for (const m of NETWORK_MESSAGES) expect(classifyError(new Error(m))).toBe('network');
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    expect(classifyError(aborted)).toBe('network');
  });

  it('classifies 401/403 as access and other statuses as unknown', () => {
    expect(classifyError(Object.assign(new Error('nope'), { status: 401 }))).toBe('access');
    expect(classifyError(Object.assign(new Error('nope'), { status: 403 }))).toBe('access');
    expect(classifyError(Object.assign(new Error('nope'), { status: 404 }))).toBe('unknown');
    expect(classifyError(Object.assign(new Error('nope'), { status: 500 }))).toBe('unknown');
  });

  // The whole point of the type: `crypto` gates a destructive "delete & start
  // fresh" button, so every ambiguous shape must fall through to `unknown`.
  it('never guesses crypto for an unrecognized or transport-shaped failure', () => {
    expect(classifyError(new Error('Something went wrong'))).toBe('unknown');
    expect(classifyError(new Error(''))).toBe('unknown');
    expect(classifyError(undefined)).toBe('unknown');
    expect(classifyError('a bare string')).toBe('unknown');
    // A 5xx whose body happens to contain crypto vocabulary is still not crypto.
    expect(classifyError(Object.assign(new Error('decryption failed'), { status: 503 }))).toBe('unknown');
    // A network failure wins over crypto vocabulary in the same message.
    expect(classifyError(new Error('Failed to fetch: decryption failed'))).toBe('network');
  });

  // Not a string literal: the REAL error object, built the way starfish-spaces'
  // `openEncryptor` builds it. This pins the two properties the gate depends on —
  // that the human message lands on `.message` (not the `spaceId` positional), and
  // that no numeric `status` short-circuits the check before CRYPTO_RE runs.
  it('classifies the real SpaceAccessError of a keyring-open failure as crypto', () => {
    const e = new SpaceAccessError(
      '',
      undefined,
      "You're not a recipient of this node's keyring — ask the owner to invite you.",
    );
    expect(classifyError(e)).toBe('crypto');
  });

  // The other SpaceAccessError messages are genuine denials: the space key simply
  // isn't here, or never was. Neither trusting the space nor destroying the content
  // helps, so they must not reach the `crypto` branch.
  it('keeps a plain access denial out of the crypto branch', () => {
    for (const m of [
      "You don't have access to this node.",
      "You're a member of this space, but the space key isn't on this device yet — ask the owner to invite you.",
      'This node has no keyring yet — ask the owner to create it first.',
    ]) {
      expect(classifyError(new Error(m))).not.toBe('crypto');
    }
  });
});
