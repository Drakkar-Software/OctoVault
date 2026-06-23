/**
 * Member-cap shims — thin compatibility layer over the starfish-spaces
 * space-access store. Exposes `getMemberCap` (vault convenience helper) and
 * the store operations that the vault actively consumes.
 */
import {
  getSpaceAccessEntry,
  getNodeAccessEntry,
  removeSpaceAccessEntry,
  clearSpaceAccessStore,
} from '@drakkar.software/starfish-spaces';
export type { SpaceAccessEntry, SpaceAccessMap } from '@drakkar.software/starfish-spaces';
export { getNodeAccessEntry, removeSpaceAccessEntry, clearSpaceAccessStore };

/** Returns the raw cap string for member-kind entries; null otherwise. */
export function getMemberCap(spaceId: string): string | null {
  const entry = getSpaceAccessEntry(spaceId);
  return entry?.kind === 'member' ? entry.cap : null;
}
