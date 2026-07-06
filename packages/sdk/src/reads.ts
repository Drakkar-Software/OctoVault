/**
 * dk-spaces-sdk 0.31 stopped wrapping the read-marks store — `createReadsStore` is
 * gone. Build the generic `createPrefsStore` directly with dk-spaces-sdk's read
 * config preset, and re-derive the old room-specific method names this module used
 * to expose (the generic store only has `get`/`mutate`/`subscribe`/etc.).
 */
import { createPrefsStore, type ReadPrefs, type Session } from '@drakkar.software/starfish-spaces';
import { readPrefsConfig } from '@drakkar.software/dk-spaces-sdk';

const _store = createPrefsStore<ReadPrefs>({
  ...readPrefsConfig('octovault'),
  client: (s) => s.accountClient,
});

export const getReadPrefs = () => _store.get();
export const getRoomReadAt = (roomId: string) => _store.get().nodes[roomId];
export const subscribeReads = (listener: () => void) => _store.subscribe(listener);
export const loadReadMarksFromKv = (userId: string) => _store.loadFromKv(userId);
export const hydrateReads = (userId: string, serverPrefs: ReadPrefs) => _store.hydrate(userId, serverPrefs);
export const resetReads = () => _store.reset();
export const flushReadsNow = () => _store.flushNow();
export const setRoomReadAt = (session: Session, roomId: string, ts: number) =>
  _store.mutate(session, (cur) =>
    ts > (cur.nodes[roomId] ?? 0) ? { nodes: { ...cur.nodes, [roomId]: ts } } : null,
  );
