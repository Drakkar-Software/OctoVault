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

/** Tombstone every field whose key starts with `prefix` (per-voter / per-reactor
 *  register cleanup on entity delete). */
export function deleteFieldsByPrefix(doc: WalDocument, prefix: string): void {
  for (const key of Object.keys(doc.materialize())) {
    if (key.startsWith(prefix)) doc.deleteField(key);
  }
}
