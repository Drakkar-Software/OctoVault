import type { WalDocument } from '@drakkar.software/starfish-wal';
import { randomId } from './domain/ids';
import { rgaList, dedupRgaList, asStr, asNum } from './wal-helpers';

export type FormFieldKind = 'text' | 'email' | 'number' | 'select' | 'checkbox';

export interface FormFieldOption {
  id: string;
  label: string;
}

export interface FormField {
  id: string;
  label: string;
  kind: FormFieldKind;
  required: boolean;
  options: FormFieldOption[];
}

export interface FormResponse {
  id: string;
  submittedAt: number;
  submitter: string;
  data: Record<string, unknown>;
}

const FIELDS    = 'fields';
const RESPONSES = 'responses';

const labelList      = (id: string) => `flabel:${id}`;
const kindReg        = (id: string) => `fkind:${id}`;
const requiredReg    = (id: string) => `frequired:${id}`;
const optionsReg     = (id: string) => `foptions:${id}`;
const submittedAtReg = (id: string) => `rsubmittedAt:${id}`;
const submitterReg   = (id: string) => `rsubmitter:${id}`;
const dataReg        = (id: string) => `rdata:${id}`;

function safeParseJson<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function readFields(doc: WalDocument): FormField[] {
  const state = doc.materialize();
  const fields: FormField[] = [];
  for (const raw of dedupRgaList(state[FIELDS])) {
    fields.push({
      id: raw,
      label: doc.text(labelList(raw)),
      kind: (typeof state[kindReg(raw)] === 'string' ? state[kindReg(raw)] : 'text') as FormFieldKind,
      required: state[requiredReg(raw)] === true,
      options: safeParseJson<FormFieldOption[]>(state[optionsReg(raw)]) ?? [],
    });
  }
  return fields;
}

export function readResponses(doc: WalDocument): FormResponse[] {
  const state = doc.materialize();
  const responses: FormResponse[] = [];
  for (const raw of dedupRgaList(state[RESPONSES])) {
    responses.push({
      id: raw,
      submittedAt: asNum(state[submittedAtReg(raw)], 0),
      submitter: asStr(state[submitterReg(raw)]),
      data: safeParseJson<Record<string, unknown>>(state[dataReg(raw)]) ?? {},
    });
  }
  return responses;
}

export function addField(doc: WalDocument, init: Partial<FormField> = {}): string {
  const id = randomId();
  const order = rgaList(doc, FIELDS);
  doc.setField(kindReg(id), init.kind ?? 'text');
  if (init.required) doc.setField(requiredReg(id), true);
  if (init.options?.length) doc.setField(optionsReg(id), JSON.stringify(init.options));
  if (init.label) doc.setText(labelList(id), init.label);
  doc.setList(FIELDS, [...order, id]);
  return id;
}

export function deleteField(doc: WalDocument, id: string): void {
  const order = rgaList(doc, FIELDS);
  doc.setList(FIELDS, order.filter((x) => x !== id));
  doc.setText(labelList(id), '');
  doc.deleteField(kindReg(id));
  doc.deleteField(requiredReg(id));
  doc.deleteField(optionsReg(id));
}

export function moveField(doc: WalDocument, id: string, toIndex: number): void {
  const order = rgaList(doc, FIELDS);
  const without = order.filter((x) => x !== id);
  const clamped = Math.max(0, Math.min(toIndex, without.length));
  without.splice(clamped, 0, id);
  doc.setList(FIELDS, without);
}

export function patchField(doc: WalDocument, id: string, patch: Partial<Omit<FormField, 'id'>>): void {
  if (patch.kind !== undefined) doc.setField(kindReg(id), patch.kind);
  if (patch.required !== undefined) doc.setField(requiredReg(id), patch.required);
  if (patch.options !== undefined) doc.setField(optionsReg(id), JSON.stringify(patch.options));
  if (patch.label !== undefined) doc.setText(labelList(id), patch.label);
}

export function addResponse(doc: WalDocument, submitter: string, data: Record<string, unknown>, now: number): string {
  const id = randomId();
  const order = rgaList(doc, RESPONSES);
  doc.setField(submittedAtReg(id), now);
  doc.setField(submitterReg(id), submitter);
  doc.setField(dataReg(id), JSON.stringify(data));
  doc.setList(RESPONSES, [...order, id]);
  return id;
}
