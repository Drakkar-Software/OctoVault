/**
 * OctoVault-specific space-registry extensions.
 *
 * `readSpaces` — wraps starfish-spaces' core to re-flatten `mutes` and `reads`
 * from the `extra` bag so call-sites that destructure `{ spaces, mutes, reads }`
 * continue to work after the starfish-spaces 0.24 SpacesDoc restructure.
 *
 * `leaveSpace` and `CategoryError` are vault-specific (not in starfish-spaces).
 */
import { readSpaces as _readSpaces, updateSpacesDoc, removeSpaceAccessEntry } from '@drakkar.software/starfish-spaces';
import type { MutePrefs, ReadPrefs } from '@drakkar.software/octospaces-sdk';
import type { StarfishClient } from '@drakkar.software/starfish-client';
import type { Session } from '@drakkar.software/starfish-spaces';

// ── Extra-field coercers ───────────────────────────────────────────────────────
// `mutes` and `reads` were top-level SpacesDoc fields in octospaces-sdk <0.23;
// they now live under `extra.mutes` / `extra.reads` in the generic SpacesDoc.
// These coercers round-trip the value tolerantly (unknown / absent → empty prefs).
// TODO: remove when starfish-spaces restores typed accessors for extra.mutes / extra.reads.

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function coerceMutePrefs(v: unknown): MutePrefs {
  const r = asRecord(v);
  const nodes: MutePrefs['nodes'] = {};
  for (const [k, val] of Object.entries(asRecord(r.nodes))) {
    if (typeof val === 'number' || val === true) nodes[k] = val as MutePrefs['nodes'][string];
  }
  const spaces: MutePrefs['spaces'] = {};
  for (const [k, val] of Object.entries(asRecord(r.spaces))) {
    if (typeof val === 'number' || val === true) spaces[k] = val as MutePrefs['spaces'][string];
  }
  return { nodes, spaces };
}

function coerceReadPrefs(v: unknown): ReadPrefs {
  const r = asRecord(v);
  const nodes: ReadPrefs['nodes'] = {};
  for (const [k, val] of Object.entries(asRecord(r.nodes))) {
    if (typeof val === 'number') nodes[k] = val;
  }
  return { nodes };
}

/**
 * Wraps starfish-spaces `readSpaces` to re-flatten OctoVault-specific extra fields:
 * - `mutes: MutePrefs` — from `doc.extra.mutes`
 * - `reads: ReadPrefs` — from `doc.extra.reads`
 *
 * Call-sites that destructure `{ spaces, caps, mutes, reads }` work without change.
 */
export async function readSpaces(client: StarfishClient, session: Session) {
  const doc = await _readSpaces(client, session);
  const extra = doc.extra ?? {};
  return {
    ...doc,
    mutes: coerceMutePrefs(extra.mutes),
    reads: coerceReadPrefs(extra.reads),
  };
}

/**
 * Member-side: leave a space — drop it from this identity's own `_spaces` doc (the
 * `spaces` list AND its `caps`/`pubAccess` entry) through the conflict-retrying
 * `updateSpacesDoc` funnel, then forget its member cap from the local store.
 *
 * This is a LOCAL leave (the user stops syncing/seeing the space) — it does NOT
 * remove the user from the owner's roster or rotate the keyring; that is the owner's
 * `removeSpaceMember`, and a true keyring revoke is out of scope.
 */
export async function leaveSpace(
  client: StarfishClient,
  session: Session,
  spaceId: string,
): Promise<void> {
  await updateSpacesDoc(client, session, (cur) => {
    if (!cur.spaces.some((s) => s.id === spaceId)) return cur; // not joined — skip
    const caps = { ...cur.caps };
    delete caps[spaceId];
    const pubAccess = { ...cur.pubAccess };
    delete pubAccess[spaceId];
    return { spaces: cur.spaces.filter((s) => s.id !== spaceId), caps, pubAccess };
  });
  removeSpaceAccessEntry(spaceId);
}

/** A user-facing category/space validation failure (empty/duplicate name).
 *  The hook layer surfaces `message` verbatim, unlike an opaque network/HTTP error. */
export class CategoryError extends Error {}
