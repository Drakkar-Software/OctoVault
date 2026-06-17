/**
 * One column header cell in a {@link TableBlock}. Displays the column type glyph,
 * title (micro mono uppercase, Ink & Pearl label idiom), and a sort indicator.
 * The whole header is a Pressable that opens the column's {@link AdaptiveMenu}.
 *
 * The active-sort column also shows a full-height accent spine wash on the column —
 * achieved by passing `sortActive` down from the parent, which applies a
 * background to BOTH this header cell and every body cell in that column.
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { View as ViewType } from 'react-native';

import { layout, spacing, radii } from '@/theme';
import { useTheme } from '@/lib/use-theme';
import { useHover } from '@/lib/use-hover';
import { AdaptiveMenu } from '@/components/ui/AdaptiveMenu';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';
import { Icon } from '@/components/ui/Icon';
import { Txt } from '@/components/ui/Txt';
import type { TableHook, TableColumn, TableColType } from '@/lib/use-table';

const COL_TYPE_ICON: Record<TableColType, import('@/components/ui/Icon').IconName> = {
  text: 'text',
  number: 'hash',
  select: 'list',
  checkbox: 'square',
};

interface TableHeaderCellProps {
  column: TableColumn;
  table: TableHook;
  sortActive: boolean;
  columnIndex: number;
  columnCount: number;
  colWidth: number;
}

export function TableHeaderCell({ column, table, sortActive, columnIndex, columnCount, colWidth }: TableHeaderCellProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<ViewType | null>(null);

  const currentSort = table.sort;
  const isSortedAsc = sortActive && currentSort?.dir === 'asc';
  const isSortedDesc = sortActive && currentSort?.dir === 'desc';
  const hasFilter = !!table.filters[column.id];

  const bg = sortActive ? colors.accentBg : hovered ? colors.hover : undefined;

  return (
    <>
      <Pressable
        ref={anchorRef}
        accessibilityRole="header"
        accessibilityLabel={column.title || 'Column'}
        onPress={() => setMenuOpen(true)}
        {...hoverProps}
        style={[
          styles.cell,
          { width: column.type === 'checkbox' ? layout.tableCheckboxColWidth : colWidth },
          bg ? { backgroundColor: bg } : null,
        ]}
      >
        <Icon
          name={COL_TYPE_ICON[column.type]}
          size={11}
          color={sortActive ? colors.accent : colors.inkFaint}
        />
        <Txt
          variant="micro"
          weight="bold"
          mono
          uppercase
          color={sortActive ? colors.accent : colors.inkMuted}
          numberOfLines={1}
          style={styles.title}
        >
          {column.title || 'Untitled'}
        </Txt>
        {hasFilter && !sortActive && (
          <Icon name="filter" size={10} color={colors.accent} />
        )}
        {isSortedAsc && <Icon name="arrow-up" size={11} color={colors.accent} />}
        {isSortedDesc && <Icon name="arrow-down" size={11} color={colors.accent} />}
      </Pressable>

      <AdaptiveMenu visible={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={anchorRef} title={column.title || 'Column'}>
        <Menu>
          <MenuLabel>Sort</MenuLabel>
          <MenuItem
            icon="arrow-up"
            label="Sort ascending"
            checked={isSortedAsc}
            onPress={() => { table.setSort(column.id, 'asc'); setMenuOpen(false); }}
          />
          <MenuItem
            icon="arrow-down"
            label="Sort descending"
            checked={isSortedDesc}
            onPress={() => { table.setSort(column.id, 'desc'); setMenuOpen(false); }}
          />
          {sortActive && (
            <MenuItem
              icon="x"
              label="Clear sort"
              onPress={() => { table.clearSort(); setMenuOpen(false); }}
            />
          )}

          <MenuSeparator />
          <MenuLabel>Column type</MenuLabel>
          {(['text', 'number', 'select', 'checkbox'] as TableColType[]).map((t) => (
            <MenuItem
              key={t}
              icon={COL_TYPE_ICON[t]}
              label={t.charAt(0).toUpperCase() + t.slice(1)}
              checked={column.type === t}
              onPress={() => { table.setColumnType(column.id, t); setMenuOpen(false); }}
            />
          ))}

          <MenuSeparator />
          <MenuLabel>Column</MenuLabel>
          <MenuItem
            icon="edit"
            label="Rename"
            onPress={() => {
              // Renaming is handled inline in the header; for now re-open with
              // a new column name via prompt would be added here in a follow-up.
              setMenuOpen(false);
            }}
          />
          {columnIndex > 0 && (
            <MenuItem
              icon="arrow-l"
              label="Move left"
              onPress={() => { table.moveColumn(column.id, columnIndex - 1); setMenuOpen(false); }}
            />
          )}
          {columnIndex < columnCount - 1 && (
            <MenuItem
              icon="arrow-r"
              label="Move right"
              onPress={() => { table.moveColumn(column.id, columnIndex + 1); setMenuOpen(false); }}
            />
          )}
          <MenuItem
            icon="plus"
            label="Insert column left"
            onPress={() => { table.addColumn('text', 'Column'); table.moveColumn(table.columns[table.columns.length - 1]!.id, columnIndex); setMenuOpen(false); }}
          />
          <MenuItem
            icon="plus"
            label="Insert column right"
            onPress={() => { table.addColumn('text', 'Column'); table.moveColumn(table.columns[table.columns.length - 1]!.id, columnIndex + 1); setMenuOpen(false); }}
          />

          <MenuSeparator />
          <MenuItem
            icon="trash"
            label="Delete column"
            danger
            onPress={() => { table.deleteColumn(column.id); setMenuOpen(false); }}
          />
        </Menu>
      </AdaptiveMenu>
    </>
  );
}

const styles = StyleSheet.create({
  cell: {
    height: layout.tableHeaderHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1 },
});
