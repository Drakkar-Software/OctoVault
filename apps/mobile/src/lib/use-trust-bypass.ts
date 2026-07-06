/**
 * Per-space, per-identity opt-in to bypass the keyring's trusted-adder check via
 * `buildEncryptorTofu` (see `packages/sdk/src/starfish/client.ts`). Device-local,
 * kv-persisted, keyed per identity so switching accounts never leaks one user's
 * bypassed spaces into another's (the `use-nav-prefs.ts` module-store idiom).
 *
 * SECURITY: a space only ever enters this set via an explicit user action
 * (the "Trust this space & retry" button) — never automatically.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { kvGet, kvSet } from '@drakkar.software/octovault-sdk';
import { useSession } from './session-context';

const keyFor = (userId: string) => `octovault.trust-bypass.${userId}`;

let snapshot: Set<string> = new Set();
let activeKey: string | null = null;
const listeners = new Set<() => void>();

function emit(next: Set<string>): void {
  snapshot = next;
  for (const l of listeners) l();
}

/** Fire-and-forget persist — mirrors use-nav-prefs.ts's `persist`. */
function persist(): void {
  if (!activeKey) return;
  void kvSet(activeKey, JSON.stringify(Array.from(snapshot)));
}

function getTrustBypass(): Set<string> {
  return snapshot;
}

function subscribeTrustBypass(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Load `userId`'s bypassed spaces into the live snapshot. Idempotent per identity. */
async function hydrateTrustBypass(userId: string): Promise<void> {
  const key = keyFor(userId);
  if (activeKey === key) return;
  activeKey = key;
  let raw: string | null = null;
  try {
    raw = await kvGet(key);
  } catch {
    /* unreadable storage — fall through to empty */
  }
  if (activeKey !== key) return;
  let ids: string[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    /* corrupt blob — empty */
  }
  emit(new Set(ids));
}

/** Drop the live snapshot on sign-out so the next identity starts clean. */
function resetTrustBypass(): void {
  activeKey = null;
  emit(new Set());
}

export interface TrustBypass {
  /** Whether the active identity has opted to bypass the keyring trust check for this space. */
  isBypassed: (spaceId: string) => boolean;
  /** Opt this space into the bypass (persisted) — call only from the explicit "Trust this space" action. */
  enableBypass: (spaceId: string) => void;
}

/** Live trust-bypass set for React consumers, hydrated per identity on session change. */
export function useTrustBypass(): TrustBypass {
  const { session } = useSession();
  const userId = session?.userId ?? null;
  const bypassed = useSyncExternalStore(subscribeTrustBypass, getTrustBypass, getTrustBypass);

  useEffect(() => {
    if (userId) void hydrateTrustBypass(userId);
    else resetTrustBypass();
  }, [userId]);

  // Fail safe to "not bypassed" until the snapshot belongs to THIS identity — a
  // just-switched account must never briefly read the previous account's set.
  const current = userId !== null && activeKey === keyFor(userId);

  return {
    isBypassed: (spaceId: string) => current && bypassed.has(spaceId),
    enableBypass: (spaceId: string) => {
      if (!current || bypassed.has(spaceId)) return;
      emit(new Set(bypassed).add(spaceId));
      persist();
    },
  };
}
