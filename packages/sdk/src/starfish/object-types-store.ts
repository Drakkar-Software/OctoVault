/**
 * Pure CRDT-safe reducers for the user-defined type registry.
 * The `types/_index` doc holds `{ types: TypeDef[] }`; each TypeDef is the
 * whole-object merge unit (node-level LWW — field edits in the same second can
 * lose, bounded to low-frequency type-definition changes).
 *
 * All functions are pure over the document value; no React/network.
 */
import { randomId } from '../domain/ids';

export type PropKind = 'text' | 'number' | 'select' | 'date' | 'checkbox' | 'url' | 'relation';
export type EditorKind = 'page' | 'board' | 'file' | 'record' | 'calendar' | 'form' | 'feedback' | 'none';
export type ContentKind = 'append' | 'merge' | 'none';

export interface SelectOption {
  id: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  kind: PropKind;
  required?: boolean;
  options?: SelectOption[];
  /** For `kind: 'relation'` — the target ObjectType id. */
  targetType?: string;
}

export interface TypeDef {
  id: string;
  label: string;
  icon: string;
  color?: string;
  editorKind: EditorKind;
  contentKind: ContentKind;
  fields: FieldDef[];
  creatable: boolean;
  archived: boolean;
}

export interface TypesDoc {
  types: TypeDef[];
}

export const EMPTY_TYPES_DOC: TypesDoc = { types: [] };

export function addType(doc: TypesDoc, def: Omit<TypeDef, 'id'>): { doc: TypesDoc; id: string } {
  const id = randomId();
  const type: TypeDef = { id, ...def };
  return { doc: { ...doc, types: [...doc.types, type] }, id };
}

export function patchType(
  doc: TypesDoc,
  id: string,
  patch: Partial<Omit<TypeDef, 'id' | 'fields'>>,
): TypesDoc {
  return { ...doc, types: doc.types.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function addField(doc: TypesDoc, typeId: string, field: FieldDef): TypesDoc {
  return {
    ...doc,
    types: doc.types.map((t) =>
      t.id === typeId ? { ...t, fields: [...t.fields, field] } : t,
    ),
  };
}

export function patchField(
  doc: TypesDoc,
  typeId: string,
  fieldKey: string,
  patch: Partial<FieldDef>,
): TypesDoc {
  return {
    ...doc,
    types: doc.types.map((t) =>
      t.id === typeId
        ? { ...t, fields: t.fields.map((f) => (f.key === fieldKey ? { ...f, ...patch } : f)) }
        : t,
    ),
  };
}

export function removeField(doc: TypesDoc, typeId: string, fieldKey: string): TypesDoc {
  return {
    ...doc,
    types: doc.types.map((t) =>
      t.id === typeId ? { ...t, fields: t.fields.filter((f) => f.key !== fieldKey) } : t,
    ),
  };
}

export function reorderFields(doc: TypesDoc, typeId: string, keys: string[]): TypesDoc {
  return {
    ...doc,
    types: doc.types.map((t) => {
      if (t.id !== typeId) return t;
      const byKey = new Map(t.fields.map((f) => [f.key, f]));
      const ordered = keys.map((k) => byKey.get(k)).filter((f): f is FieldDef => !!f);
      const rest = t.fields.filter((f) => !keys.includes(f.key));
      return { ...t, fields: [...ordered, ...rest] };
    }),
  };
}

export function archiveType(doc: TypesDoc, id: string): TypesDoc {
  return patchType(doc, id, { archived: true });
}
