/**
 * Member-cap shims — thin compatibility layer over the shared octospaces-sdk
 * space-access store. Exposes `getMemberCap` (vault convenience helper) and
 * the three store operations that the vault actively consumes.
 */
import {
  getSpaceAccessEntry,
  getNodeAccessEntry,
  removeSpaceAccessEntry,
  clearSpaceAccessStore,
} from '@drakkar.software/octospaces-sdk';
export type { SpaceAccessEntry, SpaceAccessMap } from '@drakkar.software/octospaces-sdk';
export { getNodeAccessEntry, removeSpaceAccessEntry, clearSpaceAccessStore };

/** Returns the raw cap string for member-kind entries; null otherwise. */
export function getMemberCap(spaceId: string): string | null {
  const entry = getSpaceAccessEntry(spaceId);
  return entry?.kind === 'member' ? entry.cap : null;
}
