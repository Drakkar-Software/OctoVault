/**
 * Internal helpers shared by the WAL/CRDT content projections (`page-content`,
 * `board-content`, `calendar-content`, `form-content`, `feedback-content`,
 * `table-content`, `comments-content`). Pure functions over a {@link WalDocument}
 * / materialized state — no op encoding, ordering, or register semantics live
 * here, only the boilerplate each projection repeated verbatim.
 *
 * NOT part of the package's public surface: nothing here is re-exported from
 * `index.ts`. These exist solely so the per-type content files stay short.
 */
import type { Json, WalDocument } from '@drakkar.software/starfish-wal';

/** Narrow a materialized Json value to its string members (filter only — keeps
 *  duplicates, mirroring the raw RGA list order). Returns `[]` when not an array. */
export function strArray(value: Json | undefined): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

/** The string members of an RGA list register, in stored order (NOT de-duplicated —
 *  callers that persist the list rely on this so a concurrent-merge duplicate is
 *  visible and can be reconciled by the mutation). */
export function rgaList(doc: WalDocument, key: string): string[] {
  return strArray(doc.materialize()[key]);
}

/** The string members of an RGA list register, in stored order, **de-duplicated** —
 *  the read-projection variant (a concurrent reorder can list an id twice; a
 *  projection must surface each entity once). */
export function dedupRgaList(value: Json | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if (Array.isArray(value)) {
    for (const raw of value) {
      if (typeof raw !== 'string' || seen.has(raw)) continue; // dedup concurrent reorders
      seen.add(raw);
      out.push(raw);
    }
  }
  return out;
}

/** Coerce a LWW register to a string (empty when absent/non-string). */
export const asStr = (v: Json | undefined): string => (typeof v === 'string' ? v : '');

/** Coerce a LWW register to a number (falls back when absent/non-number). */
export const asNum = (v: Json | undefined, fallback: number): number =>
  typeof v === 'number' ? v : fallback;

/** Coerce a LWW register to a boolean, or `undefined` when absent/non-boolean. */
export const asBool = (v: Json | undefined): boolean | undefined =>
  typeof v === 'boolean' ? v : undefined;

/** Coerce a LWW register to a string, or `null` when absent/non-string (the
 *  nullable-string projection variant, distinct from `asStr`'s empty-string fallback). */
export const asStrOrNull = (v: Json | undefined): string | null =>
  typeof v === 'string' ? v : null;

/** Narrow a LWW register to a plain object of shape `T`, or `undefined` when absent /
 *  non-object / an array. (The register stores arbitrary Json; this is the guarded cast
 *  every object-valued projection repeated inline.) */
export const asObj = <T>(v: Json | undefined): T | undefined =>
  v != null && typeof v === 'object' && !Array.isArray(v) ? (v as unknown as T) : undefined;

/** Tombstone every field whose key starts with `prefix` (per-voter / per-reactor
 *  register cleanup on entity delete). */
export function deleteFieldsByPrefix(doc: WalDocument, prefix: string): void {
  for (const key of Object.keys(doc.materialize())) {
    if (key.startsWith(prefix)) doc.deleteField(key);
  }
}
