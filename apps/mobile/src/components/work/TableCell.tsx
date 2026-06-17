/**
 * One data cell in a {@link TableBlock} row. Switches on column type:
 *   text    — AutosaveField (borderless, body, debounce log)
 *   number  — AutosaveField (borderless, mono, right-aligned)
 *   select  — Pill with swatchName; taps to open an option picker Popover
 *   checkbox — Pressable todo-style square/check glyph
 *
 * The active-sort column receives a faint `accentBg` background wash, forming the
 * vertical "sorted-column spine" that makes shared sort state legible at a glance.
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { View as ViewType } from 'react-native';

import { layout, motion, spacing } from '@/theme';
import { useTheme } from '@/lib/use-theme';
import { useHover } from '@/lib/use-hover';
import { Popover } from '@/components/ui/Popover';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { AutosaveField } from '@/components/ui/AutosaveField';
import { Pill } from '@/components/ui/Pill';
import { Icon } from '@/components/ui/Icon';
import type { SwatchName } from '@/theme';
import type { TableHook, TableColumn, CellValue, TableSelectOption } from '@/lib/use-table';

interface TableCellProps {
  rowId: string;
  column: TableColumn;
  table: TableHook;
  sortActive: boolean;
  /** Whether the entire row is hovered (affects background). */
  rowHovered: boolean;
}

export function TableCell({ rowId, column, table, sortActive, rowHovered }: TableCellProps) {
  const { colors } = useTheme();
  const value = table.getCell(rowId, column.id);

  const bg = sortActive ? colors.accentBg : rowHovered ? colors.hover : undefined;

  const cellWidth = column.type === 'checkbox' ? layout.tableCheckboxColWidth : (column.width ?? layout.tableColDefaultWidth);

  return (
    <View style={[styles.cell, { width: cellWidth }, bg ? { backgroundColor: bg } : null]}>
      {column.type === 'text' && (
        <TextCell value={typeof value === 'string' ? value : ''} onChange={(v) => table.setCell(rowId, column.id, v)} />
      )}
      {column.type === 'number' && (
        <NumberCell value={value !== null && value !== undefined ? String(value) : ''} onChange={(v) => table.setCell(rowId, column.id, v === '' ? null : parseFloat(v) || v)} />
      )}
      {column.type === 'select' && (
        <SelectCell value={typeof value === 'string' ? value : null} column={column} onChange={(v) => table.setCell(rowId, column.id, v)} />
      )}
      {column.type === 'checkbox' && (
        <CheckboxCell checked={value === true} onChange={(v) => table.setCell(rowId, column.id, v)} />
      )}
    </View>
  );
}

// ── Sub-cell components ────────────────────────────────────────────────────────

function TextCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <AutosaveField
      initialText={value}
      onCommit={(text) => onChange(text)}
      debounceMs={motion.autosaveLog}
      commitEmpty
      plain
      autoFocus={false}
      containerStyle={styles.fieldContainer}
    />
  );
}

function NumberCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <AutosaveField
      initialText={value}
      onCommit={(text) => onChange(text)}
      debounceMs={motion.autosaveLog}
      commitEmpty
      plain
      mono
      autoFocus={false}
      containerStyle={[styles.fieldContainer, styles.numberField]}
    />
  );
}

function SelectCell({
  value,
  column,
  onChange,
}: {
  value: string | null;
  column: TableColumn;
  onChange: (v: CellValue) => void;
}) {
  const { colors } = useTheme();
  const anchorRef = useRef<ViewType | null>(null);
  const [open, setOpen] = useState(false);
  const options = column.options ?? [];
  const selected = options.find((o) => o.id === value);

  return (
    <View style={styles.selectCell} ref={anchorRef}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selected?.label ?? 'Pick option'}
        onPress={() => setOpen(true)}
        hitSlop={4}
      >
        {selected ? (
          <Pill label={selected.label} swatchName={selected.swatch as SwatchName} />
        ) : (
          <View style={[styles.emptySelect, { borderColor: colors.lineFaint }]} />
        )}
      </Pressable>
      <Popover visible={open} onClose={() => setOpen(false)} anchorRef={anchorRef} placement="bottom-start" width={180}>
        <Menu>
          {options.map((opt: TableSelectOption) => (
            <MenuItem
              key={opt.id}
              label={opt.label}
              checked={opt.id === value}
              onPress={() => { onChange(opt.id); setOpen(false); }}
            />
          ))}
          {value !== null && (
            <MenuItem
              label="Clear"
              icon="x"
              onPress={() => { onChange(null); setOpen(false); }}
            />
          )}
        </Menu>
      </Popover>
    </View>
  );
}

function CheckboxCell({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.checkbox}
      hitSlop={8}
    >
      <Icon
        name={checked ? 'square-check' : 'square'}
        size={layout.checkboxSize}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    height: layout.tableRowHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  fieldContainer: { flex: 1 },
  numberField: { alignItems: 'flex-end' },
  selectCell: { alignItems: 'flex-start' },
  emptySelect: {
    width: 20,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  checkbox: {
    alignItems: 'center',
    justifyContent: 'center',
    height: layout.tableRowHeight,
    width: layout.tableCheckboxColWidth,
  },
});
