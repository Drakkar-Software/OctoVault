import { useCallback } from 'react';
import { useRouter } from 'expo-router';

import { clearWalCache, objLogName } from '@drakkar.software/octovault-sdk';

import { useSpaceObjects } from './space-objects-context';

/**
 * Recovery action for a node whose content can never be opened again (e.g. the
 * keyring/content mismatch `KeyringTrustNotice` surfaces): archives the broken
 * node — recoverable from Trash, but its content stays unreadable — and
 * creates an empty replacement of the same type/title/emoji/parent, then
 * navigates to it.
 */
export function useRecreateObject(spaceId: string, objectId: string) {
  const router = useRouter();
  const { objects } = useSpaceObjects();

  return useCallback(() => {
    const node = objects.get(objectId);
    if (!node) return;
    objects.archive(objectId);
    // The abandoned doc's cached op-log can never be decrypted again, and any
    // outbox entry for it must not be pushed now that the node is archived.
    void clearWalCache(objLogName(spaceId, objectId));
    const newId = objects.create({
      type: node.type,
      title: node.title || 'Untitled',
      emoji: node.emoji,
      parentId: node.parentId,
    });
    if (newId) router.replace({ pathname: '/work/object/[id]', params: { id: newId, spaceId } });
  }, [objects, objectId, spaceId, router]);
}
