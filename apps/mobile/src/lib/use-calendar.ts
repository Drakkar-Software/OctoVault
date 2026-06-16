import { useCallback, useMemo } from 'react';

import { useObjectContent } from './use-object-content';
import {
  readEvents,
  addEvent,
  deleteEvent,
  patchEvent,
  type CalendarEvent,
} from '@drakkar.software/octovault-sdk';

export type { CalendarEvent } from '@drakkar.software/octovault-sdk';

export interface CalendarHook {
  events: CalendarEvent[];
  ready: boolean;
  opening: boolean;
  openError: string | null;
  offline: boolean;
  reload: () => void;
  addEvent: (init: { start: number; end?: number; title?: string; allDay?: boolean; color?: string; desc?: string }) => string | undefined;
  deleteEvent: (id: string) => void;
  patchEvent: (id: string, patch: Partial<Omit<CalendarEvent, 'id'>>) => void;
}

export function useCalendar(spaceId: string, objectId: string, opts: { enabled?: boolean } = {}): CalendarHook {
  const { walDoc: doc, ready, version, touch, opening, openError, offline, reload } = useObjectContent(
    spaceId,
    objectId,
    'append',
    opts,
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = useMemo<CalendarEvent[]>(() => (doc ? readEvents(doc) : []), [doc, version]);

  const mut = useCallback(
    <T,>(fn: (d: NonNullable<typeof doc>) => T): T | undefined => {
      if (!doc) return undefined;
      const r = fn(doc);
      touch();
      return r;
    },
    [doc, touch],
  );

  return {
    events,
    ready,
    opening,
    openError,
    offline,
    reload,
    addEvent: (init) => mut((d) => addEvent(d, init)),
    deleteEvent: (id) => mut((d) => deleteEvent(d, id)),
    patchEvent: (id, patch) => mut((d) => patchEvent(d, id, patch)),
  };
}
