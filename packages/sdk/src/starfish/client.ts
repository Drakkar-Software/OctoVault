/**
 * Starfish client construction + space keyring / encryptor / profile helpers.
 *
 * Profile read/write functions are thin wrappers that inject the global
 * connection config (baseUrl, namespace via the octospaces-sdk residual
 * `getSyncBase()` / `getSyncNamespace()`) into the starfish-spaces API,
 * preserving the old single-argument call signature used throughout the app.
 *
 * openEncryptor / buildEncryptor are OctoVault-flavored wrappers: they take a
 * `spaceId` string and construct the keyring pull path internally.
 *
 * makeClient is re-exported as an alias for the renamed makeSpaceClient.
 */
import type { Encryptor } from '@drakkar.software/starfish-client';
import type { StarfishClient } from '@drakkar.software/starfish-client';

import {
  makeSpaceClient,
  capProviderFor,
  openEncryptor as _openEncryptor,
  buildEncryptor as _buildEncryptor,
  ownerEnsureKeyring,
  readProfile as _readProfile,
  readProfiles as _readProfiles,
  writeProfile as _writeProfile,
  ensurePseudo as _ensurePseudo,
  ensureProfileKeys as _ensureProfileKeys,
  defaultSpaceLayout,
} from '@drakkar.software/starfish-spaces';
import type { DeviceKeys, PublicProfile, SpaceLayout } from '@drakkar.software/starfish-spaces';
import { signRequest, stableStringify } from '@drakkar.software/starfish-protocol';
import type { SignableMethod } from '@drakkar.software/starfish-protocol';
import {
  getSyncBase,
  getSyncNamespace,
  getSyncPrefix,
  profilePull,
  profilePush,
  accountScope,
  linkedDeviceScope,
} from '@drakkar.software/dk-spaces-sdk';

import { keyringPull } from '@drakkar.software/dk-spaces-sdk';

export type { DeviceKeys, PublicProfile };
export { capProviderFor, ownerEnsureKeyring };

/**
 * Build cap-cert auth headers for a raw `fetch` outside the StarfishClient (e.g. `GET /events`).
 * Signing host is derived from `getSyncBase()` so the server-side verifier agrees — same pin as
 * the client's own REST requests (StarfishClient.signingHost).
 *
 * starfish-spaces re-exports its own `buildAuthHeaders` that hardcodes `host: ""`, which causes
 * `verifyRequestSignature` to fail on deployed servers that bind host. This local override
 * restores correct behavior: sign the REAL host.
 */
export async function buildAuthHeaders(
  cap: unknown,
  devEdPrivHex: string,
  method: string,
  pathAndQuery: string,
): Promise<Record<string, string>> {
  let host = '';
  try {
    host = new URL(getSyncBase()).host;
  } catch { /* relative base — empty host, both sides agree */ }

  const { sig, ts, nonce } = await signRequest(
    { method: method as SignableMethod, pathAndQuery, host },
    devEdPrivHex,
  );

  const capJson = stableStringify(cap as Record<string, unknown>);
  const capB64 =
    typeof btoa === 'function'
      ? btoa(capJson)
      : Buffer.from(capJson, 'utf-8').toString('base64');

  return {
    Authorization: `Cap ${capB64}`,
    'X-Starfish-Sig': sig,
    'X-Starfish-Ts': String(ts),
    'X-Starfish-Nonce': nonce,
  };
}

/** makeClient wrapper — renamed to makeSpaceClient in starfish-spaces; injects connection globals so
 *  callers keep the old 2-arg ergonomics: makeClient(cap, edPrivHex). */
export function makeClient(cap: unknown, devEdPrivHex: string): StarfishClient {
  return makeSpaceClient(cap, devEdPrivHex, { baseUrl: getSyncBase(), namespace: getSyncNamespace() ?? '' });
}

/**
 * Build the OctoVault SpaceLayout:
 *  - namespace-aware profile paths (octospaces-sdk `profilePull`/`profilePush`)
 *  - explicit-collection `accountScope`/`linkedDeviceScope` so the minted account
 *    cap carries an explicit collections list instead of `["*"]`. The Starfish server
 *    synthesises cap roles by literal concat (`cap:read:<col>`); a wildcard `["*"]`
 *    produces `cap:read:*` which never matches the `spaces` collection's required
 *    `cap:read:spaces` — causing a 403 on `_spaces`.
 *
 * This layout is installed module-wide via `configureSpaces({ layout: octoVaultLayout() })`
 * inside `configureOctoVault` so every session builder (fresh + restore) picks it up.
 */
const _OCTOVAULT_LAYOUT: SpaceLayout = { ...defaultSpaceLayout, profilePull, profilePush, accountScope, linkedDeviceScope };
export function octoVaultLayout(): SpaceLayout {
  return _OCTOVAULT_LAYOUT;
}

/**
 * Read a user's public profile (pseudo, avatar, public keys). Injects globals.
 *
 * Unlike readProfiles (routed through a namespace-aware client), starfish-spaces'
 * readProfile does a raw `${baseUrl}${pullPath}` concat with no namespace option —
 * so baseUrl must already carry the `/v1/{ns}` prefix (getSyncPrefix()).
 */
export async function readProfile(userId: string): Promise<PublicProfile> {
  return _readProfile(userId, { baseUrl: `${getSyncBase()}${getSyncPrefix()}`, layout: octoVaultLayout() });
}

/** Read multiple users' profiles in batched round-trips. Injects globals. */
export async function readProfiles(ids: string[]): Promise<Map<string, PublicProfile>> {
  return _readProfiles(ids, {
    baseUrl: getSyncBase(),
    namespace: getSyncNamespace() ?? '',
    layout: octoVaultLayout(),
  });
}

/** Merge a patch into the caller's own profile doc. Injects the layout. */
export async function writeProfile(
  client: StarfishClient,
  userId: string,
  patch: { pseudo?: string; avatar?: string | null; edPub?: string; kemPub?: string; kemSig?: string },
): Promise<void> {
  return _writeProfile(client, userId, octoVaultLayout(), patch);
}

/** Seed the caller's profile pseudo only when none exists yet. Injects the layout. */
export async function ensurePseudo(
  client: StarfishClient,
  userId: string,
  fallback: string,
): Promise<string> {
  return _ensurePseudo(client, userId, octoVaultLayout(), fallback);
}

/** Publish this identity's Ed + KEM keys in its profile (one-time, idempotent). Injects the layout. */
export async function ensureProfileKeys(
  client: StarfishClient,
  userId: string,
  keys: { edPub: string; kemPub: string; edPriv: string },
): Promise<void> {
  return _ensureProfileKeys(client, userId, octoVaultLayout(), keys);
}

/**
 * Open a space's decryptor by spaceId, throwing a descriptive error per failure mode.
 * Wraps starfish-spaces' path-based openEncryptor using keyringPull(spaceId).
 */
export async function openEncryptor(
  client: StarfishClient,
  keys: DeviceKeys,
  spaceId: string,
  trustedAdders: string[],
): Promise<Encryptor> {
  return _openEncryptor(client, keys, keyringPull(spaceId), trustedAdders);
}

/** Soft variant of {@link openEncryptor}: returns null instead of throwing. */
export async function buildEncryptor(
  client: StarfishClient,
  keys: DeviceKeys,
  spaceId: string,
  trustedAdders: string[],
): Promise<Encryptor | null> {
  return _buildEncryptor(client, keys, keyringPull(spaceId), trustedAdders);
}

/**
 * TOFU variant of {@link buildEncryptor} for post-migration recovery. Harvests the
 * observed `addedBy` of our own wrapped-key entries from the space keyring and adds
 * them to `trustedAdders`.
 *
 * SECURITY: this defeats the keyring's provenance check (a hostile server could
 * substitute a wrapped-key entry) — invoke ONLY behind an explicit, user-initiated
 * "trust this space" bypass, never automatically.
 */
export async function buildEncryptorTofu(
  client: StarfishClient,
  keys: DeviceKeys,
  spaceId: string,
  trustedAdders: string[],
): Promise<Encryptor | null> {
  const observed = await observedKeyringAdders(client, spaceId, keys.kemPub);
  const union = Array.from(new Set([...trustedAdders, ...observed]));
  return _buildEncryptor(client, keys, keyringPull(spaceId), union);
}

/** Read a space keyring and collect the `addedBy` of every entry sealed to `kemPub`. */
async function observedKeyringAdders(
  client: StarfishClient,
  spaceId: string,
  kemPub: string,
): Promise<string[]> {
  const res = await client.pull(keyringPull(spaceId)).catch(() => null);
  const kr = (res as { data?: { epochs?: Record<string, { wrappedKeys?: Array<{ subKem?: string; addedBy?: string }> }> } } | null)?.data;
  const out: string[] = [];
  for (const epoch of Object.values(kr?.epochs ?? {})) {
    for (const entry of epoch.wrappedKeys ?? []) {
      if (entry.subKem === kemPub && typeof entry.addedBy === 'string') out.push(entry.addedBy);
    }
  }
  return out;
}
