/**
 * OctoVault SDK — KV store dependency-injection seam.
 *
 * The SDK never imports a platform KV adapter directly. At boot, the app calls
 * {@link configureKv} with the real adapter (localStorage on web, AsyncStorage
 * on native); all SDK modules that need key-value persistence import the three
 * functions below instead of importing `./starfish/kv` directly.
 *
 * Also forwards to the shared dk-spaces-sdk KV seam so that re-exported
 * DKSpaces modules (pull-cache, profile-cache, access-store, …) use the
 * same platform adapter without requiring a separate `configureKv` call.
 */
import { configureKv as dkSpacesConfigure } from '@drakkar.software/dk-spaces-sdk';

interface KvAdapter {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

let _kv: KvAdapter = {
  async get() { return null; },
  async set() { /* no-op until configured */ },
  async remove() { /* no-op until configured */ },
};

/**
 * Configure the KV store. Call at app boot before any SDK function that reads
 * or writes persisted state (member caps, mutes, reads, AI settings, etc.).
 *
 * Also wires the shared dk-spaces-sdk so its pull-cache, profile-cache, and
 * space-access-store all use the same platform adapter.
 */
export function configureKv(adapter: KvAdapter): void {
  _kv = adapter;
  dkSpacesConfigure({ get: adapter.get, set: adapter.set, remove: adapter.remove });
}

export async function kvGet(key: string): Promise<string | null> {
  return _kv.get(key);
}

export async function kvSet(key: string, value: string): Promise<void> {
  return _kv.set(key, value);
}

export async function kvRemove(key: string): Promise<void> {
  return _kv.remove(key);
}
