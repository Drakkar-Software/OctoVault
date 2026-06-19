import type { WalDocument } from '@drakkar.software/starfish-wal';
import { randomId } from './domain/ids';
import { rgaList, dedupRgaList, asNum } from './wal-helpers';

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  color: string | null;
  desc: string | null;
}

const EVENTS = 'events';
const startReg  = (id: string) => `estart:${id}`;
const endReg    = (id: string) => `eend:${id}`;
const allDayReg = (id: string) => `eallDay:${id}`;
const colorReg  = (id: string) => `ecolor:${id}`;
const descReg   = (id: string) => `edesc:${id}`;
const titleList = (id: string) => `etitle:${id}`;

export function readEvents(doc: WalDocument): CalendarEvent[] {
  const state = doc.materialize();
  const events: CalendarEvent[] = [];
  for (const raw of dedupRgaList(state[EVENTS])) {
    const start = asNum(state[startReg(raw)], 0);
    const end = asNum(state[endReg(raw)], start);
    events.push({
      id: raw,
      title: doc.text(titleList(raw)),
      start,
      end,
      allDay: state[allDayReg(raw)] === true,
      color: typeof state[colorReg(raw)] === 'string' ? (state[colorReg(raw)] as string) : null,
      desc: typeof state[descReg(raw)] === 'string' ? (state[descReg(raw)] as string) : null,
    });
  }
  return events.sort((a, b) => a.start - b.start);
}

export function addEvent(doc: WalDocument, init: { start: number; end?: number; title?: string; allDay?: boolean; color?: string; desc?: string }): string {
  const id = randomId();
  const order = rgaList(doc, EVENTS);
  doc.setField(startReg(id), init.start);
  doc.setField(endReg(id), init.end ?? init.start);
  if (init.allDay) doc.setField(allDayReg(id), true);
  if (init.color) doc.setField(colorReg(id), init.color);
  if (init.desc) doc.setField(descReg(id), init.desc);
  if (init.title) doc.setText(titleList(id), init.title);
  doc.setList(EVENTS, [...order, id]);
  return id;
}

export function deleteEvent(doc: WalDocument, id: string): void {
  const order = rgaList(doc, EVENTS);
  doc.setList(EVENTS, order.filter((x) => x !== id));
  doc.setText(titleList(id), '');
  doc.deleteField(startReg(id));
  doc.deleteField(endReg(id));
  doc.deleteField(allDayReg(id));
  doc.deleteField(colorReg(id));
  doc.deleteField(descReg(id));
}

export function patchEvent(doc: WalDocument, id: string, patch: Partial<Omit<CalendarEvent, 'id'>>): void {
  if (patch.start !== undefined) doc.setField(startReg(id), patch.start);
  if (patch.end !== undefined) doc.setField(endReg(id), patch.end);
  if (patch.allDay !== undefined) doc.setField(allDayReg(id), patch.allDay);
  if (patch.color !== undefined) {
    if (patch.color === null) doc.deleteField(colorReg(id));
    else doc.setField(colorReg(id), patch.color);
  }
  if (patch.desc !== undefined) {
    if (patch.desc === null) doc.deleteField(descReg(id));
    else doc.setField(descReg(id), patch.desc);
  }
  if (patch.title !== undefined) doc.setText(titleList(id), patch.title);
}
