/**
 * Device pairing (one-way, PIN-sealed). The existing device provisions a new
 * device's keypair + cap bundle, seals it with the PIN (Argon2id → AES-GCM), and
 * drops it on the public `_pairing/<nonce>` rendezvous. The QR carries only the
 * nonce; the new device fetches the sealed blob, opens it with the PIN, and
 * validates the cap bundle. This proves the cryptographic handshake end-to-end.
 *
 * `startDevicePairing` / `completeDevicePairing` come directly from
 * starfish-spaces — dk-spaces-sdk 0.30 stopped wrapping device pairing.
 *
 * starfish alpha.63 made root-trust MANDATORY on pairing completion: the receiving
 * device must pass `expectedRootEdPub` (a pinned root key) or `confirmUnpinnedRoot`
 * (a callback), else `completeDevicePairing` throws. OctoVault has no prior-pinned
 * root to check against here (the new device is bootstrapping FROM this scan), so
 * `confirmUnpinnedRoot` always trusts — the actual security boundary is the
 * PIN-sealed bundle + physical QR proximity, same as before this change.
 */
import {
  startDevicePairing as _startDevicePairing,
  completeDevicePairing as _completeDevicePairing,
  type PairResult,
} from '@drakkar.software/starfish-spaces';
import { pairingClientConfig } from '@drakkar.software/dk-spaces-sdk';

import type { Session } from './identity';

// OctoVault's own QR prefix. starfish-spaces' completeDevicePairing accepts any
// *-pair: prefix via its dual-accept logic, so this is safe to keep app-specific.
export const PAIR_PREFIX = 'octovault-pair:';

export type { PairResult };

/** New device: open the sealed bundle at the rendezvous nonce and install it. */
export async function completeDevicePairing(payload: string, pin: string): Promise<PairResult> {
  return _completeDevicePairing(payload, pin, {
    ...pairingClientConfig(),
    confirmUnpinnedRoot: () => true,
  });
}

/** Existing device: provision + PIN-seal a new device, publish to rendezvous, return the QR payload. */
export async function startDevicePairing(session: Session, pin: string): Promise<string> {
  return _startDevicePairing(session, pin, { prefix: PAIR_PREFIX });
}
