import { useMemo } from 'react';

import { useObjectContent, useWalMutator } from './use-object-content';
import {
  readItems,
  addItem,
  deleteItem,
  patchItem,
  vote,
  unvote,
  type FeedbackItem,
  type FeedbackStatus,
} from '@drakkar.software/octovault-sdk';

export type { FeedbackItem, FeedbackStatus } from '@drakkar.software/octovault-sdk';

export interface FeedbackHook {
  items: FeedbackItem[];
  ready: boolean;
  opening: boolean;
  openError: string | null;
  offline: boolean;
  reload: () => void;
  addItem: (title: string) => string | undefined;
  deleteItem: (id: string) => void;
  patchItem: (id: string, patch: Partial<Omit<FeedbackItem, 'id' | 'voters'>>) => void;
  vote: (id: string, userId: string) => void;
  unvote: (id: string, userId: string) => void;
}

export function useFeedback(spaceId: string, objectId: string, opts: { enabled?: boolean } = {}): FeedbackHook {
  const { walDoc: doc, ready, version, touch, opening, openError, offline, reload } = useObjectContent(
    spaceId,
    objectId,
    'append',
    opts,
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo<FeedbackItem[]>(() => (doc ? readItems(doc) : []), [doc, version]);

  const mut = useWalMutator(doc, touch);

  return {
    items,
    ready,
    opening,
    openError,
    offline,
    reload,
    addItem: (title) => mut((d) => addItem(d, title)),
    deleteItem: (id) => mut((d) => deleteItem(d, id)),
    patchItem: (id, patch) => mut((d) => patchItem(d, id, patch)),
    vote: (id, userId) => mut((d) => vote(d, id, userId)),
    unvote: (id, userId) => mut((d) => unvote(d, id, userId)),
  };
}
