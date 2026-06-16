/**
 * Generic schema-driven content model — the shared vocabulary between
 * `page-content.ts`, `board-content.ts`, and the future WAL/merge content
 * engines for custom types.
 *
 * A `ContentSchema` describes the WAL key layout for an object type:
 *  - `collections`: the named id-lists (RGAs) that hold item ids
 *  - For each item field: whether it is char-RGA text or a LWW register
 *
 * `PAGE_SCHEMA` and `BOARD_SCHEMA` express the existing page/board layouts as
 * data. Consumers that need to open a generic WAL doc (e.g. a future record
 * editor) read the schema instead of hard-coding key names.
 */

/** How a field's value is stored in the WAL doc. */
export type FieldKind =
  | 'charRga' // character-level CRDT text list (`text:{id}` pattern)
  | 'lww';    // last-write-wins register (`name:{id}` pattern)

export interface ContentField {
  key: string;
  kind: FieldKind;
}

/** One named id-list (RGA) in the WAL doc, plus the per-item fields. */
export interface ContentCollection {
  /** The WAL key for the id-list (e.g. `'order'`, `'columns'`, `'tasks'`). */
  listKey: string;
  /** Per-item field descriptors; keys are the base name (actual key = `${base}:${id}`). */
  fields: ContentField[];
}

/** Full schema for an object type's WAL content doc. */
export interface ContentSchema {
  collections: ContentCollection[];
}

/** Page content schema: one `order` collection whose items have char-RGA text
 *  plus LWW registers for type/checked/indent/collapsed/ref. */
export const PAGE_SCHEMA: ContentSchema = {
  collections: [
    {
      listKey: 'order',
      fields: [
        { key: 'text', kind: 'charRga' },
        { key: 'type', kind: 'lww' },
        { key: 'checked', kind: 'lww' },
        { key: 'indent', kind: 'lww' },
        { key: 'collapsed', kind: 'lww' },
        { key: 'ref', kind: 'lww' },
      ],
    },
  ],
};

/** Board content schema: `columns` collection (title/done per column) plus
 *  `tasks` collection (col/order/status/title/notes per task).
 *  NOTE: In Phase F, tasks will become first-class ObjectNodes and the `tasks`
 *  collection will be removed from this schema. */
export const BOARD_SCHEMA: ContentSchema = {
  collections: [
    {
      listKey: 'columns',
      fields: [
        { key: 'coltitle', kind: 'lww' },
        { key: 'coldone', kind: 'lww' },
      ],
    },
    {
      listKey: 'tasks',
      fields: [
        { key: 'task', kind: 'lww' }, // task:{id}:col / :order / :status / :title / :notes
      ],
    },
  ],
};

export const CALENDAR_SCHEMA: ContentSchema = {
  collections: [
    {
      listKey: 'events',
      fields: [
        { key: 'etitle',  kind: 'charRga' },
        { key: 'estart',  kind: 'lww' },
        { key: 'eend',    kind: 'lww' },
        { key: 'eallDay', kind: 'lww' },
        { key: 'ecolor',  kind: 'lww' },
        { key: 'edesc',   kind: 'lww' },
      ],
    },
  ],
};

export const FORM_SCHEMA: ContentSchema = {
  collections: [
    {
      listKey: 'fields',
      fields: [
        { key: 'flabel',    kind: 'charRga' },
        { key: 'fkind',     kind: 'lww' },
        { key: 'frequired', kind: 'lww' },
        { key: 'foptions',  kind: 'lww' },
      ],
    },
    {
      listKey: 'responses',
      fields: [
        { key: 'rsubmittedAt', kind: 'lww' },
        { key: 'rsubmitter',   kind: 'lww' },
        { key: 'rdata',        kind: 'lww' },
      ],
    },
  ],
};

export const FEEDBACK_SCHEMA: ContentSchema = {
  collections: [
    {
      listKey: 'items',
      fields: [
        { key: 'ititle',  kind: 'charRga' },
        { key: 'istatus', kind: 'lww' },
        { key: 'idesc',   kind: 'lww' },
        // Per-voter LWW toggle registers: `ivote:{itemId}:{userId}` (boolean true).
        // Cross-voter concurrent votes commute; same-voter vote vs unvote is LWW.
        { key: 'ivote',   kind: 'lww' },
      ],
    },
  ],
};

/** Resolve the schema for an object's content kind.
 *  Returns null for `'none'` (no content doc). */
export function schemaFor(editorKind: string): ContentSchema | null {
  switch (editorKind) {
    case 'page':     return PAGE_SCHEMA;
    case 'board':    return BOARD_SCHEMA;
    case 'calendar': return CALENDAR_SCHEMA;
    case 'form':     return FORM_SCHEMA;
    case 'feedback': return FEEDBACK_SCHEMA;
    default:         return null;
  }
}
