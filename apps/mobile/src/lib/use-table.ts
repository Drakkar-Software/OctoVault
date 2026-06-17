/**
 * `useTable` — thin React hook composing a page's WAL doc with the table-content
 * CRDT model. Tables live inside a page's WAL document (not in their own doc), so
 * this hook takes the `PageHook` returned by `usePage` and reads/writes through
 * its already-open `doc` + `mutate`.
 */
import { useMemo } from 'react';

import * as tbl from '@drakkar.software/octovault-sdk';
import type {
  TableColumn,
  TableColType,
  TableFilter,
  TableModel,
  TableSelectOption,
  TableSort,
  TableSwatchName,
  CellValue,
  SortDir,
} from '@drakkar.software/octovault-sdk';
import type { PageHook } from './use-page';

export type { TableColumn, TableColType, TableFilter, TableModel, TableSelectOption, TableSort, TableSwatchName, CellValue, SortDir };

export interface TableHook {
  // Read state
  columns: TableColumn[];
  /** Visible (post-filter, post-sort) row ids. */
  rows: string[];
  /** All stored row ids (unfiltered, unsorted) — needed for move/delete ops. */
  allRowIds: string[];
  sort: TableSort | null;
  filters: Record<string, TableFilter>;
  ready: boolean;

  /** Get a cell value (null when unset). */
  getCell: (rowId: string, colId: string) => CellValue;

  // Column mutations
  addColumn: (type: TableColType, title: string) => void;
  renameColumn: (colId: string, title: string) => void;
  setColumnType: (colId: string, type: TableColType) => void;
  setColumnOptions: (colId: string, options: TableSelectOption[]) => void;
  addSelectOption: (colId: string, label: string, swatch?: TableSwatchName) => void;
  removeSelectOption: (colId: string, optionId: string) => void;
  moveColumn: (colId: string, toIndex: number) => void;
  deleteColumn: (colId: string) => void;

  // Row mutations
  addRow: (atIndex?: number) => void;
  moveRow: (rowId: string, toIndex: number) => void;
  duplicateRow: (rowId: string) => void;
  deleteRow: (rowId: string) => void;

  // Cell mutations
  setCell: (rowId: string, colId: string, value: CellValue) => void;

  // Sort / filter mutations
  setSort: (colId: string, dir: SortDir) => void;
  clearSort: () => void;
  setFilter: (colId: string, filter: TableFilter) => void;
  clearFilter: (colId: string) => void;
  clearAllFilters: () => void;
}

/**
 * Bind a single table block to read/mutation methods.
 *
 * @param page   The result of `usePage` for the containing page.
 * @param blockId  The block id of the `table` block.
 */
export function useTable(page: PageHook, blockId: string): TableHook {
  // Re-compute the model whenever the underlying WAL doc changes (version bumps
  // on every mutation, mirroring the `blocks` memo in usePage).
  const model = useMemo<TableModel | null>(
    () => (page.doc ? tbl.readTable(page.doc, blockId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page.doc, page.version, blockId],
  );

  const rows = useMemo(
    () => (model ? tbl.visibleTableRowIds(model) : []),
    [model],
  );

  const { mutate } = page;

  return {
    columns: model?.columns ?? [],
    rows,
    allRowIds: model?.rowIds ?? [],
    sort: model?.sort ?? null,
    filters: model?.filters ?? {},
    ready: page.ready,

    getCell: (r, c) => model?.cells[`${r}:${c}`] ?? null,

    // Column
    addColumn:        (type, title) => { mutate((d) => tbl.addTableColumn(d, blockId, type, title)); },
    renameColumn:     (colId, title) => { mutate((d) => tbl.renameTableColumn(d, colId, title)); },
    setColumnType:    (colId, type) => { mutate((d) => tbl.setTableColumnType(d, colId, type)); },
    setColumnOptions: (colId, opts) => { mutate((d) => tbl.setTableColumnOptions(d, colId, opts)); },
    addSelectOption:  (colId, label, swatch) => { mutate((d) => tbl.addTableSelectOption(d, colId, label, swatch)); },
    removeSelectOption: (colId, optId) => { mutate((d) => tbl.removeTableSelectOption(d, colId, optId)); },
    moveColumn:       (colId, toIdx) => { mutate((d) => tbl.moveTableColumn(d, blockId, colId, toIdx)); },
    deleteColumn:     (colId) => { mutate((d) => tbl.deleteTableColumn(d, blockId, colId)); },

    // Row
    addRow:       (atIdx) => {
      console.log('[useTable] addRow called, doc:', !!page.doc, 'blockId:', blockId);
      mutate((d) => tbl.addTableRow(d, blockId, atIdx));
    },
    moveRow:      (rowId, toIdx) => { mutate((d) => tbl.moveTableRow(d, blockId, rowId, toIdx)); },
    duplicateRow: (rowId) => { mutate((d) => tbl.duplicateTableRow(d, blockId, rowId)); },
    deleteRow:    (rowId) => { mutate((d) => tbl.deleteTableRow(d, blockId, rowId)); },

    // Cell
    setCell: (r, c, v) => { mutate((d) => tbl.setTableCell(d, r, c, v)); },

    // Sort / filter
    setSort:          (colId, dir) => { mutate((d) => tbl.setTableSort(d, blockId, colId, dir)); },
    clearSort:        () => { mutate((d) => tbl.clearTableSort(d, blockId)); },
    setFilter:        (colId, filter) => { mutate((d) => tbl.setTableFilter(d, blockId, colId, filter)); },
    clearFilter:      (colId) => { mutate((d) => tbl.clearTableFilter(d, blockId, colId)); },
    clearAllFilters:  () => { mutate((d) => tbl.clearAllTableFilters(d, blockId)); },
  };
}
