/**
 * Inline table block model on a {@link WalDocument} — a page's WAL doc can hold
 * one or more table blocks among its other blocks, each keyed by its block id `T`.
 *
 * CRDT design decisions
 *  - Columns: RGA list `tblcols:{T}` of column ids + per-column LWW registers.
 *    Mirrors board-content's column list exactly (`coltitle:{c}` pattern).
 *  - Rows: RGA list `tblrows:{T}` of row ids. Like page-content's `order`.
 *  - Cells: `tcell:{r}:{c}` — whole-value LWW scalar registers. Deliberate trade-off:
 *    concurrent edits to the SAME cell are last-writer-wins (simpler, no char-RGA).
 *    Concurrent edits to DIFFERENT cells / rows / columns converge freely.
 *  - Sort + filters: `tblsort:{T}` / `tblfilters:{T}` — LWW JSON objects shared
 *    across all collaborators. Sort/filter are render-time derivations: the stored
 *    `tblrows` order is NEVER mutated by sort.
 *
 * Pure functions over a WalDocument: no React, no network — unit-testable.
 */
import type { Json, WalDocument } from '@drakkar.software/starfish-wal';

import { randomId } from './domain/ids';
import { rgaList, dedupRgaList, asStr } from './wal-helpers';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Swatch names available for `TableSelectOption` colors.
 * Mirrors `SwatchName` from `theme.ts` (SDK copy avoids an app-layer dependency).
 */
export type TableSwatchName = 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';

export type TableColType = 'text' | 'number' | 'select' | 'checkbox';

/** One option in a `select` column — id + display label + categorical swatch. */
export interface TableSelectOption {
  id: string;
  label: string;
  swatch: TableSwatchName;
}

export interface TableColumn {
  id: string;
  title: string;
  type: TableColType;
  /** Options for `type === 'select'` columns. */
  options?: TableSelectOption[];
  /** Column width override in pixels; undefined uses the layout default. */
  width?: number;
}

export type CellValue = string | number | boolean | null;

export type SortDir = 'asc' | 'desc';

export interface TableSort {
  colId: string;
  dir: SortDir;
}

export type TableFilter =
  | { kind: 'contains'; text: string }
  | { kind: 'numRange'; min?: number; max?: number }
  | { kind: 'isOption'; optionIds: string[] }
  | { kind: 'checked'; value: boolean };

export interface TableModel {
  columns: TableColumn[];
  /** Stored (insertion-ordered) row ids — NOT sorted/filtered. */
  rowIds: string[];
  /** Cell values keyed `${rowId}:${colId}`. Missing key = null / empty. */
  cells: Record<string, CellValue>;
  sort: TableSort | null;
  filters: Record<string, TableFilter>;
}

// ── WAL key builders ───────────────────────────────────────────────────────────

const tblCols = (T: string) => `tblcols:${T}`;
const tblRows = (T: string) => `tblrows:${T}`;
const tblSort = (T: string) => `tblsort:${T}`;
const tblFilters = (T: string) => `tblfilters:${T}`;
const tColTitle = (c: string) => `tcoltitle:${c}`;
const tColType  = (c: string) => `tcoltype:${c}`;
const tColOpts  = (c: string) => `tcolopts:${c}`;
const tColWidth = (c: string) => `tcolwidth:${c}`;
const tCell     = (r: string, c: string) => `tcell:${r}:${c}`;

// ── Internal helpers ───────────────────────────────────────────────────────────

const colIdsOf = (doc: WalDocument, T: string): string[] => rgaList(doc, tblCols(T));
const rowIdsOf = (doc: WalDocument, T: string): string[] => rgaList(doc, tblRows(T));

// ── Read projection ────────────────────────────────────────────────────────────

/** Project the WAL document into the full {@link TableModel} for block `T`. */
export function readTable(doc: WalDocument, T: string): TableModel {
  const state = doc.materialize();

  // Columns — dedup concurrent reorders (mirrors readBlocks / readColumns)
  const columns: TableColumn[] = [];
  for (const raw of dedupRgaList(state[tblCols(T)])) {
    const optsRaw = state[tColOpts(raw)];
    const options: TableSelectOption[] | undefined = Array.isArray(optsRaw)
      ? (optsRaw as Json[])
          .filter((o): o is Record<string, Json> => typeof o === 'object' && o !== null && !Array.isArray(o))
          .map((o) => ({
            id: asStr(o['id']),
            label: asStr(o['label']),
            swatch: (asStr(o['swatch']) || 'gray') as TableSwatchName,
          }))
      : undefined;
    const widthRaw = state[tColWidth(raw)];
    const typeRaw = state[tColType(raw)];
    const colType: TableColType = (['text', 'number', 'select', 'checkbox'] as TableColType[]).includes(typeRaw as TableColType)
      ? (typeRaw as TableColType)
      : 'text';
    columns.push({
      id: raw,
      title: asStr(state[tColTitle(raw)]),
      type: colType,
      options: options?.length ? options : undefined,
      width: typeof widthRaw === 'number' ? widthRaw : undefined,
    });
  }

  // Rows — dedup
  const rowIds = dedupRgaList(state[tblRows(T)]);

  // Cells — iterate stored (row, col) pairs
  const cells: Record<string, CellValue> = {};
  for (const r of rowIds) {
    for (const col of columns) {
      const v = state[tCell(r, col.id)];
      if (v !== undefined && v !== null) {
        cells[`${r}:${col.id}`] = v as CellValue;
      }
    }
  }

  // Sort
  const sortRaw = state[tblSort(T)];
  const sort: TableSort | null =
    sortRaw !== null &&
    typeof sortRaw === 'object' &&
    !Array.isArray(sortRaw) &&
    typeof (sortRaw as Record<string, Json>)['colId'] === 'string' &&
    ((sortRaw as Record<string, Json>)['dir'] === 'asc' || (sortRaw as Record<string, Json>)['dir'] === 'desc')
      ? {
          colId: (sortRaw as Record<string, Json>)['colId'] as string,
          dir: (sortRaw as Record<string, Json>)['dir'] as SortDir,
        }
      : null;

  // Filters
  const filtersRaw = state[tblFilters(T)];
  const filters: Record<string, TableFilter> =
    filtersRaw !== null && typeof filtersRaw === 'object' && !Array.isArray(filtersRaw)
      ? (filtersRaw as unknown as Record<string, TableFilter>)
      : {};

  return { columns, rowIds, cells, sort, filters };
}

// ── Render-side derivation ─────────────────────────────────────────────────────

/**
 * Derive the visible (post-filter, post-sort) row id list from a {@link TableModel}.
 * Pure — no WAL writes. The stored `rowIds` order is NEVER mutated by sort.
 */
export function visibleTableRowIds(model: TableModel): string[] {
  const { columns, rowIds: ids, cells, sort, filters } = model;
  const colMap = new Map<string, TableColumn>(columns.map((c) => [c.id, c]));

  // 1. Apply filters
  let visible = ids;
  for (const [colId, filter] of Object.entries(filters)) {
    const col = colMap.get(colId);
    if (!col) continue;
    visible = visible.filter((r) => {
      const v = cells[`${r}:${colId}`] ?? null;
      switch (filter.kind) {
        case 'contains':
          return String(v ?? '').toLowerCase().includes(filter.text.toLowerCase());
        case 'numRange': {
          const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
          if (isNaN(n)) return false;
          if (filter.min !== undefined && n < filter.min) return false;
          if (filter.max !== undefined && n > filter.max) return false;
          return true;
        }
        case 'isOption':
          return filter.optionIds.length === 0 || filter.optionIds.includes(String(v ?? ''));
        case 'checked':
          return (v === true || v === 'true') === filter.value;
      }
    });
  }

  // 2. Apply sort
  if (sort) {
    const col = colMap.get(sort.colId);
    if (col) {
      const optOrder = new Map<string, number>(
        col.options ? col.options.map((o, i) => [o.id, i] as [string, number]) : [],
      );
      visible = [...visible].sort((a, b) => {
        const av = cells[`${a}:${sort.colId}`] ?? null;
        const bv = cells[`${b}:${sort.colId}`] ?? null;
        let cmp = 0;
        switch (col.type) {
          case 'number': {
            const an = typeof av === 'number' ? av : parseFloat(String(av ?? ''));
            const bn = typeof bv === 'number' ? bv : parseFloat(String(bv ?? ''));
            if (isNaN(an) && isNaN(bn)) { cmp = 0; break; }
            if (isNaN(an)) { cmp = 1; break; }
            if (isNaN(bn)) { cmp = -1; break; }
            cmp = an - bn;
            break;
          }
          case 'select': {
            const ai = optOrder.get(String(av ?? '')) ?? Infinity;
            const bi = optOrder.get(String(bv ?? '')) ?? Infinity;
            cmp = ai - bi;
            break;
          }
          case 'checkbox': {
            cmp = (av === true ? 1 : 0) - (bv === true ? 1 : 0);
            break;
          }
          default: // text
            cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        }
        if (cmp !== 0) return sort.dir === 'asc' ? cmp : -cmp;
        // Stable tiebreak by id
        return a < b ? -1 : a > b ? 1 : 0;
      });
    }
  }

  return visible;
}

// ── Seed ──────────────────────────────────────────────────────────────────────

/**
 * Seed a newly-inserted table block: 3 columns (Name · Status · Notes) + 2 empty rows.
 * Called from the page editor immediately after the block is created.
 */
export function createTable(doc: WalDocument, T: string): void {
  const nameId = randomId();
  const statusId = randomId();
  const notesId = randomId();

  const statusOpts: TableSelectOption[] = [
    { id: randomId(), label: 'Not started', swatch: 'gray' },
    { id: randomId(), label: 'In progress', swatch: 'blue' },
    { id: randomId(), label: 'Done', swatch: 'green' },
  ];

  doc.setField(tColTitle(nameId), 'Name');
  doc.setField(tColType(nameId), 'text');

  doc.setField(tColTitle(statusId), 'Status');
  doc.setField(tColType(statusId), 'select');
  doc.setField(tColOpts(statusId), statusOpts as unknown as Json);

  doc.setField(tColTitle(notesId), 'Notes');
  doc.setField(tColType(notesId), 'text');

  doc.setList(tblCols(T), [nameId, statusId, notesId]);

  const r1 = randomId();
  const r2 = randomId();
  doc.setList(tblRows(T), [r1, r2]);
}

// ── Column mutations ───────────────────────────────────────────────────────────

/** Add a new column and return its id. */
export function addTableColumn(doc: WalDocument, T: string, type: TableColType, title: string): string {
  const id = randomId();
  doc.setField(tColTitle(id), title);
  doc.setField(tColType(id), type);
  if (type === 'select') {
    doc.setField(tColOpts(id), [{ id: randomId(), label: 'Option 1', swatch: 'gray' }] as unknown as Json);
  }
  doc.push(tblCols(T), id);
  return id;
}

export function renameTableColumn(doc: WalDocument, id: string, title: string): void {
  doc.setField(tColTitle(id), title);
}

export function setTableColumnType(doc: WalDocument, id: string, type: TableColType): void {
  doc.setField(tColType(id), type);
  if (type === 'select') {
    const cur = doc.materialize()[tColOpts(id)];
    if (!Array.isArray(cur) || cur.length === 0) {
      doc.setField(tColOpts(id), [{ id: randomId(), label: 'Option 1', swatch: 'gray' }] as unknown as Json);
    }
  }
}

export function setTableColumnOptions(doc: WalDocument, id: string, options: TableSelectOption[]): void {
  doc.setField(tColOpts(id), options as unknown as Json);
}

export function addTableSelectOption(doc: WalDocument, colId: string, label: string, swatch: TableSwatchName = 'gray'): void {
  const state = doc.materialize();
  const cur = Array.isArray(state[tColOpts(colId)]) ? (state[tColOpts(colId)] as Json[]) : [];
  doc.setField(tColOpts(colId), [...cur, { id: randomId(), label, swatch }] as unknown as Json);
}

export function removeTableSelectOption(doc: WalDocument, colId: string, optionId: string): void {
  const state = doc.materialize();
  const cur = Array.isArray(state[tColOpts(colId)])
    ? (state[tColOpts(colId)] as unknown as TableSelectOption[])
    : [];
  doc.setField(tColOpts(colId), cur.filter((o) => o.id !== optionId) as unknown as Json);
}

export function setTableColumnWidth(doc: WalDocument, colId: string, width: number): void {
  doc.setField(tColWidth(colId), width);
}

export function moveTableColumn(doc: WalDocument, T: string, id: string, toIndex: number): void {
  const cur = colIdsOf(doc, T).filter((x, i, a) => a.indexOf(x) === i);
  if (!cur.includes(id)) return;
  const next = cur.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, id);
  doc.setList(tblCols(T), next);
}

/**
 * Delete a column: remove it from the column list, tombstone its registers, and
 * clear all cells in that column.
 */
export function deleteTableColumn(doc: WalDocument, T: string, id: string): void {
  const curRowIds = rowIdsOf(doc, T); // read before mutation
  doc.setList(tblCols(T), colIdsOf(doc, T).filter((x) => x !== id));
  doc.deleteField(tColTitle(id));
  doc.deleteField(tColType(id));
  doc.deleteField(tColOpts(id));
  doc.deleteField(tColWidth(id));
  for (const r of curRowIds) doc.deleteField(tCell(r, id));
}

// ── Row mutations ──────────────────────────────────────────────────────────────

/** Add a new row at `atIndex` (appends if omitted). Returns the new row id. */
export function addTableRow(doc: WalDocument, T: string, atIndex?: number): string {
  const id = randomId();
  const cur = rowIdsOf(doc, T);
  if (atIndex !== undefined) {
    const at = Math.max(0, Math.min(atIndex, cur.length));
    doc.setList(tblRows(T), [...cur.slice(0, at), id, ...cur.slice(at)]);
  } else {
    doc.push(tblRows(T), id);
  }
  return id;
}

export function moveTableRow(doc: WalDocument, T: string, id: string, toIndex: number): void {
  const cur = rowIdsOf(doc, T).filter((x, i, a) => a.indexOf(x) === i);
  if (!cur.includes(id)) return;
  const next = cur.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, id);
  doc.setList(tblRows(T), next);
}

/** Duplicate a row, placing the copy directly below the original. Returns the new row id. */
export function duplicateTableRow(doc: WalDocument, T: string, id: string): string {
  const cur = rowIdsOf(doc, T);
  const at = cur.indexOf(id);
  const insertAt = at >= 0 ? at + 1 : cur.length;
  const newId = randomId();
  doc.setList(tblRows(T), [...cur.slice(0, insertAt), newId, ...cur.slice(insertAt)]);
  // Copy cell values
  const state = doc.materialize();
  for (const c of colIdsOf(doc, T)) {
    const v = state[tCell(id, c)];
    if (v !== undefined && v !== null) doc.setField(tCell(newId, c), v);
  }
  return newId;
}

/**
 * Delete a row: remove from the row list and tombstone all its cells.
 */
export function deleteTableRow(doc: WalDocument, T: string, id: string): void {
  const curColIds = colIdsOf(doc, T); // read before mutation
  doc.setList(tblRows(T), rowIdsOf(doc, T).filter((x) => x !== id));
  for (const c of curColIds) doc.deleteField(tCell(id, c));
}

// ── Cell mutations ─────────────────────────────────────────────────────────────

/** Set or clear a single cell value (LWW). */
export function setTableCell(doc: WalDocument, r: string, c: string, value: CellValue): void {
  if (value === null || value === undefined) {
    doc.deleteField(tCell(r, c));
  } else {
    doc.setField(tCell(r, c), value as Json);
  }
}

// ── Sort / filter mutations ────────────────────────────────────────────────────

export function setTableSort(doc: WalDocument, T: string, colId: string, dir: SortDir): void {
  doc.setField(tblSort(T), { colId, dir } as unknown as Json);
}

export function clearTableSort(doc: WalDocument, T: string): void {
  doc.deleteField(tblSort(T));
}

/** Set the filter for one column. Merges into the existing filters record (LWW on the whole record). */
export function setTableFilter(doc: WalDocument, T: string, colId: string, filter: TableFilter): void {
  const state = doc.materialize();
  const cur = (state[tblFilters(T)] !== null && typeof state[tblFilters(T)] === 'object' && !Array.isArray(state[tblFilters(T)]))
    ? { ...(state[tblFilters(T)] as Record<string, Json>) }
    : {};
  cur[colId] = filter as unknown as Json;
  doc.setField(tblFilters(T), cur as unknown as Json);
}

export function clearTableFilter(doc: WalDocument, T: string, colId: string): void {
  const state = doc.materialize();
  const cur = (state[tblFilters(T)] !== null && typeof state[tblFilters(T)] === 'object' && !Array.isArray(state[tblFilters(T)]))
    ? { ...(state[tblFilters(T)] as Record<string, Json>) }
    : {};
  delete cur[colId];
  if (Object.keys(cur).length === 0) {
    doc.deleteField(tblFilters(T));
  } else {
    doc.setField(tblFilters(T), cur as unknown as Json);
  }
}

export function clearAllTableFilters(doc: WalDocument, T: string): void {
  doc.deleteField(tblFilters(T));
}

// ── Tombstone ─────────────────────────────────────────────────────────────────

/**
 * Tombstone all WAL keys owned by table block `T` (call when the block is
 * permanently deleted and undo has expired). Reads current col/row ids
 * internally so the caller does not need to pass them.
 */
export function clearTable(doc: WalDocument, T: string): void {
  const curColIds = colIdsOf(doc, T);
  const curRowIds = rowIdsOf(doc, T);
  for (const c of curColIds) {
    doc.deleteField(tColTitle(c));
    doc.deleteField(tColType(c));
    doc.deleteField(tColOpts(c));
    doc.deleteField(tColWidth(c));
    for (const r of curRowIds) doc.deleteField(tCell(r, c));
  }
  doc.setList(tblCols(T), []);
  doc.setList(tblRows(T), []);
  doc.deleteField(tblSort(T));
  doc.deleteField(tblFilters(T));
}
