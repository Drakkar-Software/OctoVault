import { describe, it, expect } from 'vitest';
import {
  WalDocument,
  createEd25519Signer,
  noopEncryptor,
  type WalTransport,
  type WalAppendElement,
} from '@drakkar.software/starfish-wal';
import { ed25519Suite } from '@drakkar.software/starfish-protocol';

import * as t from './table-content';

/** Minimal in-memory append log shared by every doc opened against it. */
function memTransport(): WalTransport {
  const store = new Map<string, WalAppendElement[]>();
  return {
    async append(key, body) {
      const arr = store.get(key) ?? [];
      const ts = (arr.length ? arr[arr.length - 1]!.ts : 0) + 1;
      arr.push({ ts, data: body.data, authorPubkey: body.authorPubkey, authorSignature: body.authorSignature });
      store.set(key, arr);
      return { ts };
    },
    async pull(key, checkpoint) {
      return (store.get(key) ?? []).filter((e) => e.ts > checkpoint).map((e) => ({ ...e }));
    },
  };
}

async function openDoc(transport: WalTransport, documentKey = 'tbl__doc'): Promise<WalDocument> {
  const { privHex, pubHex } = ed25519Suite.generateSignerKeypair();
  const doc = new WalDocument({
    documentKey,
    transport,
    signer: createEd25519Signer(pubHex, privHex),
    encryptor: noopEncryptor,
  });
  await doc.open();
  return doc;
}

/** Convenience: open a doc, call createTable on block T='T1', return doc + model. */
async function seededDoc(T = 'T1') {
  const doc = await openDoc(memTransport());
  t.createTable(doc, T);
  return doc;
}

// ── createTable ───────────────────────────────────────────────────────────────

describe('createTable', () => {
  it('seeds exactly 3 columns', async () => {
    const doc = await seededDoc();
    const model = t.readTable(doc, 'T1');
    expect(model.columns).toHaveLength(3);
  });

  it('seeds exactly 2 rows', async () => {
    const doc = await seededDoc();
    const model = t.readTable(doc, 'T1');
    expect(model.rowIds).toHaveLength(2);
  });

  it('first column is "Name" with type "text"', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    expect(columns[0]).toMatchObject({ title: 'Name', type: 'text' });
  });

  it('second column is "Status" with type "select" and 3 options', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    expect(columns[1]).toMatchObject({ title: 'Status', type: 'select' });
    expect(columns[1]!.options).toHaveLength(3);
  });

  it('third column is "Notes" with type "text"', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    expect(columns[2]).toMatchObject({ title: 'Notes', type: 'text' });
  });

  it('seeds with no sort and no filters', async () => {
    const doc = await seededDoc();
    const model = t.readTable(doc, 'T1');
    expect(model.sort).toBeNull();
    expect(model.filters).toEqual({});
  });
});

// ── addTableColumn / readTable ────────────────────────────────────────────────

describe('addTableColumn', () => {
  it('adds a column and readTable returns it', async () => {
    const doc = await seededDoc();
    const id = t.addTableColumn(doc, 'T1', 'number', 'Score');
    const { columns } = t.readTable(doc, 'T1');
    expect(columns).toHaveLength(4);
    const added = columns.find((c) => c.id === id);
    expect(added).toMatchObject({ id, title: 'Score', type: 'number' });
  });

  it('appended column appears last', async () => {
    const doc = await seededDoc();
    const id = t.addTableColumn(doc, 'T1', 'checkbox', 'Done');
    const { columns } = t.readTable(doc, 'T1');
    expect(columns[columns.length - 1]!.id).toBe(id);
  });

  it('select column gets a default option', async () => {
    const doc = await seededDoc();
    const id = t.addTableColumn(doc, 'T1', 'select', 'Priority');
    const { columns } = t.readTable(doc, 'T1');
    const col = columns.find((c) => c.id === id)!;
    expect(col.options).toBeDefined();
    expect(col.options!.length).toBeGreaterThanOrEqual(1);
  });
});

// ── renameTableColumn ─────────────────────────────────────────────────────────

describe('renameTableColumn', () => {
  it('renames a column', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    const firstId = columns[0]!.id;
    t.renameTableColumn(doc, firstId, 'Full Name');
    const updated = t.readTable(doc, 'T1');
    expect(updated.columns[0]).toMatchObject({ id: firstId, title: 'Full Name' });
  });
});

// ── setTableColumnType ────────────────────────────────────────────────────────

describe('setTableColumnType', () => {
  it('changes column type from text to number', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    const notesId = columns[2]!.id; // Notes — text
    t.setTableColumnType(doc, notesId, 'number');
    const updated = t.readTable(doc, 'T1');
    expect(updated.columns[2]!.type).toBe('number');
  });

  it('changing to select seeds a default option when none exist', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    const notesId = columns[2]!.id;
    t.setTableColumnType(doc, notesId, 'select');
    const updated = t.readTable(doc, 'T1');
    const col = updated.columns[2]!;
    expect(col.type).toBe('select');
    expect(col.options!.length).toBeGreaterThanOrEqual(1);
  });
});

// ── moveTableColumn ───────────────────────────────────────────────────────────

describe('moveTableColumn', () => {
  it('moves a column to a new index', async () => {
    const doc = await seededDoc();
    const before = t.readTable(doc, 'T1').columns.map((c) => c.id);
    // Move first column to last position
    t.moveTableColumn(doc, 'T1', before[0]!, 2);
    const after = t.readTable(doc, 'T1').columns.map((c) => c.id);
    expect(after[2]).toBe(before[0]);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[2]);
  });

  it('moving to index 0 brings the column to the front', async () => {
    const doc = await seededDoc();
    const before = t.readTable(doc, 'T1').columns.map((c) => c.id);
    t.moveTableColumn(doc, 'T1', before[2]!, 0);
    const after = t.readTable(doc, 'T1').columns.map((c) => c.id);
    expect(after[0]).toBe(before[2]);
  });

  it('no-op for unknown id', async () => {
    const doc = await seededDoc();
    const before = t.readTable(doc, 'T1').columns.map((c) => c.id);
    t.moveTableColumn(doc, 'T1', 'nonexistent', 0);
    const after = t.readTable(doc, 'T1').columns.map((c) => c.id);
    expect(after).toEqual(before);
  });
});

// ── deleteTableColumn ─────────────────────────────────────────────────────────

describe('deleteTableColumn', () => {
  it('removes the column from readTable', async () => {
    const doc = await seededDoc();
    const { columns, rowIds } = t.readTable(doc, 'T1');
    const notesId = columns[2]!.id;

    // Set a cell in that column so we can verify it is cleared
    t.setTableCell(doc, rowIds[0]!, notesId, 'hello');
    t.deleteTableColumn(doc, 'T1', notesId);

    const after = t.readTable(doc, 'T1');
    expect(after.columns.find((c) => c.id === notesId)).toBeUndefined();
    expect(after.columns).toHaveLength(2);
  });

  it('clears cells belonging to the deleted column', async () => {
    const doc = await seededDoc();
    const { columns, rowIds } = t.readTable(doc, 'T1');
    const notesId = columns[2]!.id;
    const rowId = rowIds[0]!;

    t.setTableCell(doc, rowId, notesId, 'some value');
    // Verify cell is present before deletion
    expect(t.readTable(doc, 'T1').cells[`${rowId}:${notesId}`]).toBe('some value');

    t.deleteTableColumn(doc, 'T1', notesId);

    const after = t.readTable(doc, 'T1');
    expect(after.cells[`${rowId}:${notesId}`]).toBeUndefined();
  });
});

// ── addTableRow ───────────────────────────────────────────────────────────────

describe('addTableRow', () => {
  it('appends a row when atIndex is omitted', async () => {
    const doc = await seededDoc();
    const before = t.readTable(doc, 'T1').rowIds;
    const newId = t.addTableRow(doc, 'T1');
    const after = t.readTable(doc, 'T1').rowIds;
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1]).toBe(newId);
  });

  it('inserts a row at a specific index', async () => {
    const doc = await seededDoc();
    const before = t.readTable(doc, 'T1').rowIds;
    const newId = t.addTableRow(doc, 'T1', 0);
    const after = t.readTable(doc, 'T1').rowIds;
    expect(after[0]).toBe(newId);
    expect(after[1]).toBe(before[0]);
  });

  it('inserts a row at the middle index', async () => {
    const doc = await seededDoc();
    const before = t.readTable(doc, 'T1').rowIds;
    const newId = t.addTableRow(doc, 'T1', 1);
    const after = t.readTable(doc, 'T1').rowIds;
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(newId);
    expect(after[2]).toBe(before[1]);
  });

  it('clamps out-of-bounds index to end', async () => {
    const doc = await seededDoc();
    const before = t.readTable(doc, 'T1').rowIds;
    const newId = t.addTableRow(doc, 'T1', 999);
    const after = t.readTable(doc, 'T1').rowIds;
    expect(after[after.length - 1]).toBe(newId);
    expect(after).toHaveLength(before.length + 1);
  });
});

// ── moveTableRow ──────────────────────────────────────────────────────────────

describe('moveTableRow', () => {
  it('moves a row to a new index', async () => {
    const doc = await seededDoc();
    const before = t.readTable(doc, 'T1').rowIds;
    // Move first row to second position
    t.moveTableRow(doc, 'T1', before[0]!, 1);
    const after = t.readTable(doc, 'T1').rowIds;
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it('no-op for unknown row id', async () => {
    const doc = await seededDoc();
    const before = t.readTable(doc, 'T1').rowIds;
    t.moveTableRow(doc, 'T1', 'ghost', 0);
    const after = t.readTable(doc, 'T1').rowIds;
    expect(after).toEqual(before);
  });
});

// ── deleteTableRow ────────────────────────────────────────────────────────────

describe('deleteTableRow', () => {
  it('removes the row from rowIds', async () => {
    const doc = await seededDoc();
    const { rowIds } = t.readTable(doc, 'T1');
    t.deleteTableRow(doc, 'T1', rowIds[0]!);
    const after = t.readTable(doc, 'T1');
    expect(after.rowIds).not.toContain(rowIds[0]);
    expect(after.rowIds).toHaveLength(1);
  });

  it('clears cells belonging to the deleted row', async () => {
    const doc = await seededDoc();
    const { columns, rowIds } = t.readTable(doc, 'T1');
    const rowId = rowIds[0]!;
    const colId = columns[0]!.id;

    t.setTableCell(doc, rowId, colId, 'cell content');
    expect(t.readTable(doc, 'T1').cells[`${rowId}:${colId}`]).toBe('cell content');

    t.deleteTableRow(doc, 'T1', rowId);

    const after = t.readTable(doc, 'T1');
    expect(after.cells[`${rowId}:${colId}`]).toBeUndefined();
  });
});

// ── duplicateTableRow ─────────────────────────────────────────────────────────

describe('duplicateTableRow', () => {
  it('copies cell values to the new row', async () => {
    const doc = await seededDoc();
    const { columns, rowIds } = t.readTable(doc, 'T1');
    const rowId = rowIds[0]!;
    const nameColId = columns[0]!.id;
    const notesColId = columns[2]!.id;

    t.setTableCell(doc, rowId, nameColId, 'Alice');
    t.setTableCell(doc, rowId, notesColId, 'A note');

    const newId = t.duplicateTableRow(doc, 'T1', rowId);
    const after = t.readTable(doc, 'T1');
    expect(after.cells[`${newId}:${nameColId}`]).toBe('Alice');
    expect(after.cells[`${newId}:${notesColId}`]).toBe('A note');
  });

  it('places the duplicate directly below the original', async () => {
    const doc = await seededDoc();
    const { rowIds } = t.readTable(doc, 'T1');
    const rowId = rowIds[0]!;
    const newId = t.duplicateTableRow(doc, 'T1', rowId);
    const after = t.readTable(doc, 'T1').rowIds;
    const origIdx = after.indexOf(rowId);
    const dupIdx = after.indexOf(newId);
    expect(dupIdx).toBe(origIdx + 1);
  });

  it('duplicate row does not share identity with original', async () => {
    const doc = await seededDoc();
    const { rowIds } = t.readTable(doc, 'T1');
    const newId = t.duplicateTableRow(doc, 'T1', rowIds[0]!);
    expect(newId).not.toBe(rowIds[0]);
  });
});

// ── setTableCell ──────────────────────────────────────────────────────────────

describe('setTableCell', () => {
  it('round-trips a string value through readTable', async () => {
    const doc = await seededDoc();
    const { columns, rowIds } = t.readTable(doc, 'T1');
    t.setTableCell(doc, rowIds[0]!, columns[0]!.id, 'Hello world');
    const model = t.readTable(doc, 'T1');
    expect(model.cells[`${rowIds[0]}:${columns[0]!.id}`]).toBe('Hello world');
  });

  it('round-trips a number value', async () => {
    const doc = await seededDoc();
    const { columns, rowIds } = t.readTable(doc, 'T1');
    const numColId = t.addTableColumn(doc, 'T1', 'number', 'Score');
    t.setTableCell(doc, rowIds[0]!, numColId, 42);
    const model = t.readTable(doc, 'T1');
    expect(model.cells[`${rowIds[0]}:${numColId}`]).toBe(42);
  });

  it('round-trips a boolean value', async () => {
    const doc = await seededDoc();
    const { rowIds } = t.readTable(doc, 'T1');
    const cbColId = t.addTableColumn(doc, 'T1', 'checkbox', 'Done');
    t.setTableCell(doc, rowIds[0]!, cbColId, true);
    const model = t.readTable(doc, 'T1');
    expect(model.cells[`${rowIds[0]}:${cbColId}`]).toBe(true);
  });

  it('setting null clears the cell', async () => {
    const doc = await seededDoc();
    const { columns, rowIds } = t.readTable(doc, 'T1');
    const colId = columns[0]!.id;
    t.setTableCell(doc, rowIds[0]!, colId, 'text');
    t.setTableCell(doc, rowIds[0]!, colId, null);
    const model = t.readTable(doc, 'T1');
    expect(model.cells[`${rowIds[0]}:${colId}`]).toBeUndefined();
  });
});

// ── setTableSort / clearTableSort ─────────────────────────────────────────────

describe('setTableSort / clearTableSort', () => {
  it('setTableSort stores sort config', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    t.setTableSort(doc, 'T1', columns[0]!.id, 'asc');
    const model = t.readTable(doc, 'T1');
    expect(model.sort).toEqual({ colId: columns[0]!.id, dir: 'asc' });
  });

  it('setTableSort overwrites previous sort', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    t.setTableSort(doc, 'T1', columns[0]!.id, 'asc');
    t.setTableSort(doc, 'T1', columns[1]!.id, 'desc');
    const model = t.readTable(doc, 'T1');
    expect(model.sort).toEqual({ colId: columns[1]!.id, dir: 'desc' });
  });

  it('clearTableSort removes the sort', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    t.setTableSort(doc, 'T1', columns[0]!.id, 'desc');
    t.clearTableSort(doc, 'T1');
    const model = t.readTable(doc, 'T1');
    expect(model.sort).toBeNull();
  });
});

// ── setTableFilter / clearTableFilter / clearAllTableFilters ──────────────────

describe('setTableFilter / clearTableFilter / clearAllTableFilters', () => {
  it('setTableFilter stores filter config for a column', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    const colId = columns[0]!.id;
    t.setTableFilter(doc, 'T1', colId, { kind: 'contains', text: 'Alice' });
    const model = t.readTable(doc, 'T1');
    expect(model.filters[colId]).toEqual({ kind: 'contains', text: 'Alice' });
  });

  it('setTableFilter merges multiple column filters', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    t.setTableFilter(doc, 'T1', columns[0]!.id, { kind: 'contains', text: 'a' });
    t.setTableFilter(doc, 'T1', columns[1]!.id, { kind: 'isOption', optionIds: ['x'] });
    const model = t.readTable(doc, 'T1');
    expect(Object.keys(model.filters)).toHaveLength(2);
  });

  it('clearTableFilter removes only the specified column filter', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    t.setTableFilter(doc, 'T1', columns[0]!.id, { kind: 'contains', text: 'a' });
    t.setTableFilter(doc, 'T1', columns[1]!.id, { kind: 'contains', text: 'b' });
    t.clearTableFilter(doc, 'T1', columns[0]!.id);
    const model = t.readTable(doc, 'T1');
    expect(model.filters[columns[0]!.id]).toBeUndefined();
    expect(model.filters[columns[1]!.id]).toBeDefined();
  });

  it('clearTableFilter with last filter produces empty filters object', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    t.setTableFilter(doc, 'T1', columns[0]!.id, { kind: 'contains', text: 'a' });
    t.clearTableFilter(doc, 'T1', columns[0]!.id);
    const model = t.readTable(doc, 'T1');
    expect(model.filters).toEqual({});
  });

  it('clearAllTableFilters removes all filters', async () => {
    const doc = await seededDoc();
    const { columns } = t.readTable(doc, 'T1');
    t.setTableFilter(doc, 'T1', columns[0]!.id, { kind: 'contains', text: 'a' });
    t.setTableFilter(doc, 'T1', columns[1]!.id, { kind: 'numRange', min: 1 });
    t.clearAllTableFilters(doc, 'T1');
    const model = t.readTable(doc, 'T1');
    expect(model.filters).toEqual({});
  });
});

// ── visibleTableRowIds — sort ─────────────────────────────────────────────────

describe('visibleTableRowIds — sort', () => {
  /** Build a minimal TableModel with one column and a set of rows/cells. */
  function makeNumberModel(values: number[], colType: t.TableColType = 'number'): t.TableModel {
    const colId = 'col1';
    const rowIds = values.map((_, i) => `r${i}`);
    const cells: Record<string, t.CellValue> = {};
    for (let i = 0; i < values.length; i++) {
      cells[`r${i}:col1`] = values[i]!;
    }
    return {
      columns: [{ id: colId, title: 'N', type: colType }],
      rowIds,
      cells,
      sort: null,
      filters: {},
    };
  }

  function makeTextModel(values: string[]): t.TableModel {
    const colId = 'col1';
    const rowIds = values.map((_, i) => `r${i}`);
    const cells: Record<string, t.CellValue> = {};
    for (let i = 0; i < values.length; i++) {
      cells[`r${i}:col1`] = values[i]!;
    }
    return {
      columns: [{ id: colId, title: 'T', type: 'text' }],
      rowIds,
      cells,
      sort: null,
      filters: {},
    };
  }

  it('number sort asc — numeric order, not lexical (e.g. 9 < 10)', () => {
    const model = makeNumberModel([10, 9, 2]);
    const sorted = t.visibleTableRowIds({ ...model, sort: { colId: 'col1', dir: 'asc' } });
    // 2, 9, 10 (numeric) not 10, 2, 9 (lexical)
    expect(sorted).toEqual(['r2', 'r1', 'r0']);
  });

  it('number sort desc', () => {
    const model = makeNumberModel([3, 1, 2]);
    const sorted = t.visibleTableRowIds({ ...model, sort: { colId: 'col1', dir: 'desc' } });
    expect(sorted).toEqual(['r0', 'r2', 'r1']); // 3, 2, 1
  });

  it('text sort asc — uses localeCompare', () => {
    const model = makeTextModel(['banana', 'apple', 'cherry']);
    const sorted = t.visibleTableRowIds({ ...model, sort: { colId: 'col1', dir: 'asc' } });
    // apple < banana < cherry
    expect(sorted).toEqual(['r1', 'r0', 'r2']);
  });

  it('text sort desc', () => {
    const model = makeTextModel(['banana', 'apple', 'cherry']);
    const sorted = t.visibleTableRowIds({ ...model, sort: { colId: 'col1', dir: 'desc' } });
    // cherry > banana > apple
    expect(sorted).toEqual(['r2', 'r0', 'r1']);
  });

  it('sort tiebreak is stable by id (asc id order)', () => {
    // Three rows with the same value; they should come out sorted by their ids
    const colId = 'col1';
    const rowIds = ['r_c', 'r_a', 'r_b'];
    const cells: Record<string, t.CellValue> = {
      'r_c:col1': 5,
      'r_a:col1': 5,
      'r_b:col1': 5,
    };
    const model: t.TableModel = {
      columns: [{ id: colId, title: 'N', type: 'number' }],
      rowIds,
      cells,
      sort: { colId, dir: 'asc' },
      filters: {},
    };
    const sorted = t.visibleTableRowIds(model);
    // All values equal → sort by id lexicographically
    expect(sorted).toEqual(['r_a', 'r_b', 'r_c']);
  });

  it('NaN values sort last in asc order', () => {
    const model = makeNumberModel([1, NaN, 3]);
    const asc = t.visibleTableRowIds({ ...model, sort: { colId: 'col1', dir: 'asc' } });
    // 1 < 3 < NaN  (NaN rows pushed to end in ascending)
    expect(asc[asc.length - 1]).toBe('r1'); // NaN row last
  });

  it('NaN values sort first in desc order (negated cmp)', () => {
    const model = makeNumberModel([1, NaN, 3]);
    const desc = t.visibleTableRowIds({ ...model, sort: { colId: 'col1', dir: 'desc' } });
    // desc negates cmp: NaN row lands first since its cmp=1 becomes -1
    expect(desc[0]).toBe('r1'); // NaN row first in descending
  });

  it('no sort returns stored insertion order', () => {
    const model = makeNumberModel([3, 1, 2]);
    const visible = t.visibleTableRowIds(model);
    expect(visible).toEqual(['r0', 'r1', 'r2']);
  });
});

// ── visibleTableRowIds — filter ───────────────────────────────────────────────

describe('visibleTableRowIds — filter', () => {
  it('contains filter keeps rows where cell includes text (case-insensitive)', () => {
    const colId = 'col1';
    const rowIds = ['r0', 'r1', 'r2'];
    const cells: Record<string, t.CellValue> = { 'r0:col1': 'Alice', 'r1:col1': 'Bob', 'r2:col1': 'alice smith' };
    const model: t.TableModel = {
      columns: [{ id: colId, title: 'Name', type: 'text' }],
      rowIds,
      cells,
      sort: null,
      filters: { [colId]: { kind: 'contains', text: 'alice' } },
    };
    expect(t.visibleTableRowIds(model)).toEqual(['r0', 'r2']);
  });

  it('numRange filter keeps rows within [min, max]', () => {
    const colId = 'col1';
    const rowIds = ['r0', 'r1', 'r2', 'r3'];
    const cells: Record<string, t.CellValue> = { 'r0:col1': 5, 'r1:col1': 10, 'r2:col1': 15, 'r3:col1': 20 };
    const model: t.TableModel = {
      columns: [{ id: colId, title: 'N', type: 'number' }],
      rowIds,
      cells,
      sort: null,
      filters: { [colId]: { kind: 'numRange', min: 8, max: 16 } },
    };
    expect(t.visibleTableRowIds(model)).toEqual(['r1', 'r2']);
  });

  it('numRange with only min', () => {
    const colId = 'col1';
    const rowIds = ['r0', 'r1', 'r2'];
    const cells: Record<string, t.CellValue> = { 'r0:col1': 5, 'r1:col1': 10, 'r2:col1': 15 };
    const model: t.TableModel = {
      columns: [{ id: colId, title: 'N', type: 'number' }],
      rowIds,
      cells,
      sort: null,
      filters: { [colId]: { kind: 'numRange', min: 10 } },
    };
    expect(t.visibleTableRowIds(model)).toEqual(['r1', 'r2']);
  });

  it('isOption filter keeps rows whose cell value is in optionIds', () => {
    const colId = 'col1';
    const rowIds = ['r0', 'r1', 'r2'];
    const cells: Record<string, t.CellValue> = { 'r0:col1': 'opt_a', 'r1:col1': 'opt_b', 'r2:col1': 'opt_c' };
    const model: t.TableModel = {
      columns: [{ id: colId, title: 'Status', type: 'select' }],
      rowIds,
      cells,
      sort: null,
      filters: { [colId]: { kind: 'isOption', optionIds: ['opt_a', 'opt_c'] } },
    };
    expect(t.visibleTableRowIds(model)).toEqual(['r0', 'r2']);
  });

  it('isOption with empty optionIds keeps all rows', () => {
    const colId = 'col1';
    const rowIds = ['r0', 'r1'];
    const cells: Record<string, t.CellValue> = { 'r0:col1': 'opt_a', 'r1:col1': 'opt_b' };
    const model: t.TableModel = {
      columns: [{ id: colId, title: 'Status', type: 'select' }],
      rowIds,
      cells,
      sort: null,
      filters: { [colId]: { kind: 'isOption', optionIds: [] } },
    };
    expect(t.visibleTableRowIds(model)).toEqual(['r0', 'r1']);
  });

  it('checked filter keeps only checked rows', () => {
    const colId = 'col1';
    const rowIds = ['r0', 'r1', 'r2'];
    const cells: Record<string, t.CellValue> = { 'r0:col1': true, 'r1:col1': false, 'r2:col1': true };
    const model: t.TableModel = {
      columns: [{ id: colId, title: 'Done', type: 'checkbox' }],
      rowIds,
      cells,
      sort: null,
      filters: { [colId]: { kind: 'checked', value: true } },
    };
    expect(t.visibleTableRowIds(model)).toEqual(['r0', 'r2']);
  });

  it('checked filter with value=false keeps only unchecked rows', () => {
    const colId = 'col1';
    const rowIds = ['r0', 'r1'];
    const cells: Record<string, t.CellValue> = { 'r0:col1': true, 'r1:col1': false };
    const model: t.TableModel = {
      columns: [{ id: colId, title: 'Done', type: 'checkbox' }],
      rowIds,
      cells,
      sort: null,
      filters: { [colId]: { kind: 'checked', value: false } },
    };
    expect(t.visibleTableRowIds(model)).toEqual(['r1']);
  });

  it('filter for unknown colId is a no-op', () => {
    const colId = 'col1';
    const rowIds = ['r0', 'r1'];
    const cells: Record<string, t.CellValue> = { 'r0:col1': 'a', 'r1:col1': 'b' };
    const model: t.TableModel = {
      columns: [{ id: colId, title: 'N', type: 'text' }],
      rowIds,
      cells,
      sort: null,
      filters: { ghost_col: { kind: 'contains', text: 'x' } },
    };
    expect(t.visibleTableRowIds(model)).toEqual(['r0', 'r1']);
  });
});

// ── CRDT convergence ──────────────────────────────────────────────────────────

describe('CRDT convergence across two replicas', () => {
  it('doc1 adds a column, doc2 adds a row — both converge to identical readTable', async () => {
    const transport = memTransport();
    const doc1 = await openDoc(transport, 'tbl__crdt');
    const doc2 = await openDoc(transport, 'tbl__crdt');

    // Bootstrap: doc1 creates the table and both sync
    t.createTable(doc1, 'T1');
    await doc1.commit();
    await doc2.pull();

    // Verify doc2 has the seeded table before concurrent ops
    expect(t.readTable(doc2, 'T1').columns).toHaveLength(3);

    // Concurrent: doc1 adds a column; doc2 adds a row — no coordination
    const newColId = t.addTableColumn(doc1, 'T1', 'number', 'Score');
    const newRowId = t.addTableRow(doc2, 'T1');

    await doc1.commit();
    await doc2.commit();
    await doc1.pull();
    await doc2.pull();

    const m1 = t.readTable(doc1, 'T1');
    const m2 = t.readTable(doc2, 'T1');

    // Both replicas see the same column count (3 seed + 1 = 4)
    expect(m1.columns).toHaveLength(4);
    expect(m2.columns).toHaveLength(4);

    // Both replicas see the added column
    expect(m1.columns.find((c) => c.id === newColId)).toBeDefined();
    expect(m2.columns.find((c) => c.id === newColId)).toBeDefined();

    // Both replicas see the added row (2 seed + 1 = 3)
    expect(m1.rowIds).toHaveLength(3);
    expect(m2.rowIds).toHaveLength(3);
    expect(m1.rowIds).toContain(newRowId);
    expect(m2.rowIds).toContain(newRowId);

    // Column ids and row ids are identical on both replicas
    expect(m1.columns.map((c) => c.id)).toEqual(m2.columns.map((c) => c.id));
    expect(m1.rowIds).toEqual(m2.rowIds);
  });

  it('concurrent cell writes to different cells both survive', async () => {
    const transport = memTransport();
    const doc1 = await openDoc(transport, 'tbl__cells');
    const doc2 = await openDoc(transport, 'tbl__cells');

    t.createTable(doc1, 'T1');
    await doc1.commit();
    await doc2.pull();

    const { columns, rowIds } = t.readTable(doc1, 'T1');
    const r0 = rowIds[0]!;
    const r1 = rowIds[1]!;
    const c0 = columns[0]!.id;

    // doc1 writes cell (r0, c0); doc2 writes cell (r1, c0) — concurrent
    t.setTableCell(doc1, r0, c0, 'from-doc1');
    t.setTableCell(doc2, r1, c0, 'from-doc2');
    await doc1.commit();
    await doc2.commit();
    await doc1.pull();
    await doc2.pull();

    const m1 = t.readTable(doc1, 'T1');
    const m2 = t.readTable(doc2, 'T1');

    expect(m1.cells[`${r0}:${c0}`]).toBe('from-doc1');
    expect(m1.cells[`${r1}:${c0}`]).toBe('from-doc2');
    expect(m2.cells[`${r0}:${c0}`]).toBe('from-doc1');
    expect(m2.cells[`${r1}:${c0}`]).toBe('from-doc2');
  });
});
