/**
 * Inline table block rendered inside a page. Composes:
 *   - a filter/sort bar (Pill chips, hidden when no active sort/filter)
 *   - a horizontally-scrollable grid with edge-fade gradients (web)
 *   - a header row of {@link TableHeaderCell} per column
 *   - a body of data rows (each row shows a row-handle + a {@link TableCell} per column)
 *   - a "+ row" footer and a "+ column" trailer column
 *
 * Design: "the typeset ledger" — hairline grid lines, mono-uppercase column
 * headers, number cells right-aligned in mono, the sorted column spine as the
 * single bold element (faint full-height `accentBg` wash). Outer frame mirrors the
 * board column surface (paperBorder + radii.card + shadows.sm).
 */
import { useRef, useState } from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { layout, paperBorder, radii, shadows, spacing } from '@/theme';
import { useTheme } from '@/lib/use-theme';
import { useHover } from '@/lib/use-hover';
import { useTable } from '@/lib/use-table';
import type { PageHook } from '@/lib/use-page';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Txt } from '@/components/ui/Txt';

import { AdaptiveMenu } from '@/components/ui/AdaptiveMenu';
import { Menu, MenuItem } from '@/components/ui/Menu';
import type { View as ViewType } from 'react-native';
import { TableHeaderCell } from './TableHeaderCell';
import { TableCell } from './TableCell';

interface TableBlockProps {
  page: PageHook;
  blockId: string;
}

export function TableBlock({ page, blockId }: TableBlockProps) {
  const { colors } = useTheme();
  const table = useTable(page, blockId);

  // Edge-fade state for web (mirrors BoardView pattern)
  const scrollRef = useRef<ScrollView | null>(null);
  const [fades, setFades] = useState({ left: false, right: false });
  const stripSize = useRef({ view: 0, content: 0, x: 0 });
  const refreshFades = () => {
    const { view, content, x } = stripSize.current;
    const next = { left: x > spacing.sm, right: content - x - view > spacing.sm };
    setFades((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  };
  const onStripScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    stripSize.current.x = e.nativeEvent.contentOffset.x;
    refreshFades();
  };

  const activeSortColId = table.sort?.colId ?? null;
  const hasActiveState = !!table.sort || Object.keys(table.filters).length > 0;

  const colWidth = (col: { type: string; width?: number }) =>
    col.type === 'checkbox' ? layout.tableCheckboxColWidth : (col.width ?? layout.tableColDefaultWidth);

  return (
    <View style={[styles.frame, paperBorder(colors), { borderRadius: radii.card }, shadows.sm]}>
      {/* ── Filter/sort bar ─────────────────────────────────────────── */}
      {hasActiveState && (
        <View style={[styles.filterBar, { borderBottomColor: colors.lineSoft, backgroundColor: colors.paperAlt }]}>
          {table.sort && (() => {
            const col = table.columns.find((c) => c.id === table.sort!.colId);
            return col ? (
              <Pill
                key={`sort-${col.id}`}
                label={`${col.title} ${table.sort!.dir === 'asc' ? '↑' : '↓'}`}
                tone="accent"
                onRemove={() => table.clearSort()}
              />
            ) : null;
          })()}
          {Object.entries(table.filters).map(([colId, filter]) => {
            const col = table.columns.find((c) => c.id === colId);
            if (!col) return null;
            const label = filterLabel(col.title, filter);
            return (
              <Pill key={`filter-${colId}`} label={label} tone="neutral" onRemove={() => table.clearFilter(colId)} />
            );
          })}
        </View>
      )}

      {/* ── Scrollable grid ─────────────────────────────────────────── */}
      <View style={styles.scrollWrap}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={onStripScroll}
          scrollEventThrottle={16}
          onLayout={(e) => {
            stripSize.current.view = e.nativeEvent.layout.width;
            refreshFades();
          }}
          onContentSizeChange={(w) => {
            stripSize.current.content = w;
            refreshFades();
          }}
        >
          {/* ── Single column wrapper — forces vertical stacking on iOS/web ── */}
          {/* Without this, horizontal ScrollView's default row content-container */}
          {/* lays header + body rows side-by-side on iOS instead of stacked.    */}
          <View style={styles.grid}>
            {/* ── Header row ───────────────────────────────────────── */}
            <View style={[styles.headerRow, { borderBottomColor: colors.lineSoft, backgroundColor: colors.paperAlt }]}>
              {/* Row-gutter spacer */}
              <View style={[styles.gutterHeader, { borderRightColor: colors.lineFaint }]} />
              {table.columns.map((col, idx) => (
                <TableHeaderCell
                  key={col.id}
                  column={col}
                  table={table}
                  sortActive={col.id === activeSortColId}
                  columnIndex={idx}
                  columnCount={table.columns.length}
                  colWidth={layout.tableColDefaultWidth}
                />
              ))}
              {/* Add-column button */}
              <AddColumnButton onPress={() => table.addColumn('text', 'Column')} />
            </View>

            {/* ── Body rows ────────────────────────────────────────── */}
            {table.rows.map((rowId, rowIdx) => (
              <TableBodyRow
                key={rowId}
                rowId={rowId}
                rowIndex={rowIdx}
                table={table}
                activeSortColId={activeSortColId}
                totalRows={table.rows.length}
              />
            ))}
          </View>
        </ScrollView>

        {/* Edge fades (web only) */}
        {Platform.OS === 'web' && fades.left && (
          <LinearGradient
            colors={[colors.paper, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.fade, styles.fadeLeft]}
            pointerEvents="none"
          />
        )}
        {Platform.OS === 'web' && fades.right && (
          <LinearGradient
            colors={['transparent', colors.paper]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.fade, styles.fadeRight]}
            pointerEvents="none"
          />
        )}
      </View>

      {/* ── Add-row footer (outside scroll so always visible) ─────── */}
      <AddRowButton onPress={() => table.addRow()} />
    </View>
  );
}

// ── Body row ──────────────────────────────────────────────────────────────────

interface TableBodyRowProps {
  rowId: string;
  rowIndex: number;
  table: ReturnType<typeof useTable>;
  activeSortColId: string | null;
  totalRows: number;
}

function TableBodyRow({ rowId, rowIndex, table, activeSortColId, totalRows }: TableBodyRowProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<ViewType | null>(null);

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: rowIndex < totalRows - 1 ? colors.lineSoft : 'transparent' },
      ]}
      {...hoverProps}
    >
      {/* Row handle — row number on web (ledger reference), dots on hover or mobile */}
      <View
        ref={anchorRef}
        style={[
          styles.gutter,
          { borderRightColor: colors.lineFaint },
          hovered ? { backgroundColor: colors.hover } : undefined,
        ]}
      >
        {Platform.OS === 'web' && !hovered ? (
          <Txt variant="micro" mono color={colors.inkFaint}>{rowIndex + 1}</Txt>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Row actions"
            onPress={() => setMenuOpen(true)}
            style={styles.gutterBtn}
          >
            <Icon name="dots-v" size={14} color={colors.inkFaint} />
          </Pressable>
        )}
      </View>

      {/* Cells */}
      {table.columns.map((col) => (
        <TableCell
          key={col.id}
          rowId={rowId}
          column={col}
          table={table}
          sortActive={col.id === activeSortColId}
          rowHovered={hovered}
        />
      ))}

      {/* Row menu */}
      <AdaptiveMenu visible={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={anchorRef} title="Row">
        <Menu>
          <MenuItem icon="plus" label="Insert row above" onPress={() => { table.addRow(rowIndex); setMenuOpen(false); }} />
          <MenuItem icon="plus" label="Insert row below" onPress={() => { table.addRow(rowIndex + 1); setMenuOpen(false); }} />
          <MenuItem icon="arrow-up" label="Move up" disabled={rowIndex === 0} onPress={() => { table.moveRow(rowId, rowIndex - 1); setMenuOpen(false); }} />
          <MenuItem icon="arrow-down" label="Move down" disabled={rowIndex === table.rows.length - 1} onPress={() => { table.moveRow(rowId, rowIndex + 1); setMenuOpen(false); }} />
          <MenuItem icon="duplicate" label="Duplicate row" onPress={() => { table.duplicateRow(rowId); setMenuOpen(false); }} />
          <MenuItem icon="trash" label="Delete row" danger onPress={() => { table.deleteRow(rowId); setMenuOpen(false); }} />
        </Menu>
      </AdaptiveMenu>
    </View>
  );
}

// ── Add buttons ───────────────────────────────────────────────────────────────

function AddColumnButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add column"
      onPress={onPress}
      {...hoverProps}
      style={[
        styles.addCol,
        { backgroundColor: hovered ? colors.hover : undefined, borderLeftColor: colors.lineFaint },
      ]}
    >
      <Icon name="plus" size={14} color={colors.inkFaint} />
    </Pressable>
  );
}

function AddRowButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add row"
      onPress={onPress}
      {...hoverProps}
      style={[
        styles.addRow,
        {
          backgroundColor: hovered ? colors.hover : undefined,
          borderTopColor: colors.lineSoft,
        },
      ]}
    >
      <Icon name="plus" size={13} color={colors.inkFaint} />
      <Txt variant="caption" tone="inkFaint">Add row</Txt>
    </Pressable>
  );
}

// ── Filter label helper ───────────────────────────────────────────────────────

function filterLabel(colTitle: string, filter: import('@/lib/use-table').TableFilter): string {
  switch (filter.kind) {
    case 'contains': return `${colTitle} contains "${filter.text}"`;
    case 'numRange': {
      if (filter.min !== undefined && filter.max !== undefined) return `${colTitle} ${filter.min}–${filter.max}`;
      if (filter.min !== undefined) return `${colTitle} ≥ ${filter.min}`;
      if (filter.max !== undefined) return `${colTitle} ≤ ${filter.max}`;
      return colTitle;
    }
    case 'isOption': return `${colTitle} is …`;
    case 'checked': return filter.value ? `${colTitle} checked` : `${colTitle} unchecked`;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    overflow: 'hidden',
    marginVertical: spacing.sm,
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollWrap: { position: 'relative', overflow: 'hidden' },
  // Inner column container: forces header + body rows to stack vertically inside the
  // horizontal ScrollView. Without this, RN's default row content-container lays them
  // side-by-side on iOS instead of stacked, making the table invisible.
  grid: { flexDirection: 'column' },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    alignItems: 'stretch',
  },
  gutterHeader: {
    width: layout.tableRowGutter,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gutter: {
    width: layout.tableRowGutter,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  gutterBtn: {
    width: layout.tableRowGutter,
    height: layout.tableRowHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCol: {
    width: layout.tableColDefaultWidth,
    height: layout.tableHeaderHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  addRow: {
    height: layout.tableRowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    pointerEvents: 'none',
  },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
});
