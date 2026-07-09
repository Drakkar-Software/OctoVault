/**
 * Friendly error mapping for user-facing failure surfaces (onboarding, accounts,
 * pairing, joining spaces). The sync/crypto stack throws developer-grade messages
 * ("Failed to fetch", WebAuthn DOMExceptions, Argon2/WASM internals) that erode
 * trust exactly where it matters most — the identity ceremony. Every screen that
 * renders an error to a human routes it through {@link humanizeError} first.
 *
 * The mapping is deliberately heuristic, not a taxonomy: we only special-case the
 * failure shapes users actually hit (network down, dismissed passkey prompt,
 * permission/server errors) and otherwise pass through messages that already read
 * like sentences — much of `src/lib/starfish/*` throws carefully-worded strings
 * ("That is not a valid space invite.") that SHOULD reach the user verbatim.
 */

const GENERIC_FALLBACK = 'Something went wrong. Please try again.';

/** Network-layer failures: fetch's TypeError strings differ per engine. */
const NETWORK_RE = /failed to fetch|network request failed|networkerror|load failed|fetch failed|socket|ECONN|timeout/i;

/** Internal crypto/serialization vocabulary that should never reach a human. */
const INTERNAL_RE = /argon2|wasm|hkdf|kyber|kem\b|cbor|nacl|ciphertext|deserializ|undefined is not|cannot read|JSON parse|unexpected token/i;

/**
 * Content that can never be opened again: a keyring seal/open failure, or a
 * starfish-wal author/integrity check that failed closed. Matched literally
 * against the messages those two packages actually throw — a *narrow*
 * allowlist, because {@link classifyError} promises that anything it calls
 * `crypto` is safe to offer destructive recovery for.
 *
 * `not a recipient of this node's keyring` is the one that does not look like
 * cryptography at a glance. `starfish-spaces` raises it as a `SpaceAccessError`
 * when `createKeyringEncryptor` rejects — which is exactly how the
 * userId-vs-edPub trusted-adder mismatch surfaces, and therefore the trigger the
 * "Trust this space & retry" bypass was written to catch. Classifying it as
 * `access` would leave that bypass unreachable.
 */
const CRYPTO_RE =
  /author signature invalid|unauthorized writer|malformed op-batch|envelope author\/element author mismatch|snapshot producedBy|decryption failed|failed to unwrap CEK|AES-GCM authentication failed|encrypted payload is too short|keyring is malformed|not found in keyring|not a recipient of this node's keyring/i;

/** True when a thrown message already reads like a user-facing sentence. */
function looksHuman(message: string): boolean {
  if (!message) return false;
  if (message.length > 160) return false; // long dumps are stack-ish, not copy
  if (INTERNAL_RE.test(message)) return false;
  return true;
}

/**
 * Map an unknown thrown value to a human string. Pass a `fallback` to tailor the
 * generic case to the action ("Couldn't create your identity.").
 */
export function humanizeError(e: unknown, fallback: string = GENERIC_FALLBACK): string {
  const err = e instanceof Error ? e : null;
  const message = err?.message ?? (typeof e === 'string' ? e : '');
  const name = err?.name ?? '';

  // Connectivity: the most common real-world failure across every flow.
  if (NETWORK_RE.test(message) || NETWORK_RE.test(name)) {
    return "Can't reach the sync server. Check your connection and try again.";
  }
  // WebAuthn: the user closed the passkey sheet (or the authenticator timed out).
  // DOMException name is the stable signal; messages vary wildly per browser.
  if (name === 'NotAllowedError') {
    return 'The passkey prompt was dismissed. Try again, or use your PIN.';
  }
  if (name === 'AbortError') {
    return 'That took too long. Try again.';
  }
  // HTTP-ish failures (StarfishHttpError carries a numeric `status`). Duck-typed
  // so this module doesn't import the SDK.
  const status = (e as { status?: unknown })?.status;
  if (typeof status === 'number') {
    if (status === 401 || status === 403) return "You don't have access to that. Check the invite or ask its owner.";
    if (status === 404) return fallback;
    if (status === 429) return 'Too many requests — wait a moment and try again.';
    if (status >= 500) return 'The sync server hit a problem. Try again in a moment.';
    if (status >= 400) return fallback;
  }
  return looksHuman(message) ? message : fallback;
}

/** What kind of failure an error is, for surfaces that must *act* on it rather
 *  than only render it. See {@link classifyError}. */
export type ErrorKind = 'network' | 'access' | 'crypto' | 'unknown';

/**
 * Classify a thrown value so a caller can choose a recovery affordance.
 *
 * Unlike {@link humanizeError} — which maps to display copy and may guess — this
 * is a *decision* input, so it is biased conservative: `crypto` is returned only
 * for the seal/open and author-verification messages `starfish-keyring` and
 * `starfish-wal` are known to throw. Everything unrecognized is `unknown`, never
 * `crypto`, because `crypto` is the only kind for which the UI offers to destroy
 * the content (see `KeyringTrustNotice`) — an unreachable server must never
 * reach that branch.
 *
 * Order matters: a network failure and an HTTP status are checked before the
 * message regex, so a 5xx page body cannot be mistaken for a decryption failure.
 */
export function classifyError(e: unknown): ErrorKind {
  const err = e instanceof Error ? e : null;
  const message = err?.message ?? (typeof e === 'string' ? e : '');
  const name = err?.name ?? '';

  if (NETWORK_RE.test(message) || NETWORK_RE.test(name) || name === 'AbortError') return 'network';

  const status = (e as { status?: unknown })?.status;
  if (typeof status === 'number') return status === 401 || status === 403 ? 'access' : 'unknown';

  if (CRYPTO_RE.test(message)) return 'crypto';
  return 'unknown';
}
