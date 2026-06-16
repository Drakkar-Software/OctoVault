import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { View as ViewType, ViewProps } from 'react-native';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { dropShadow, layers, layout, paperBorder, radii, shadows, spacing } from '@/theme';
import { BLOCK_SECTIONS, BLOCK_TYPES, REF_BLOCK_TYPES, type BlockTypeDef } from '@drakkar.software/octovault-sdk';
import { useHover } from '@/lib/use-hover';
import { useResponsive } from '@/lib/use-responsive';
import { useTheme } from '@/lib/use-theme';
import type { BlockType } from '@/lib/use-page';
import { Icon } from '@/components/ui/Icon';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';

/* ────────────────────────────── shared rows ────────────────────────────── */

/** One block-type row (icon + label, optional active highlight / check). */
function TypeRow({
  def,
  active,
  checked,
  onSelect,
}: {
  def: BlockTypeDef;
  /** Keyboard-highlighted (slash menu ArrowUp/Down). */
  active?: boolean;
  /** The block's CURRENT type (turn-into menus). */
  checked?: boolean;
  onSelect: (def: BlockTypeDef) => void;
}) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={def.label}
      accessibilityState={{ selected: !!active, checked: !!checked }}
      onPress={() => onSelect(def)}
      {...hoverProps}
      style={({ pressed }) => [
        styles.typeRow,
        { backgroundColor: pressed ? colors.pressed : active || hovered ? colors.hover : 'transparent' },
      ]}
    >
      <Icon name={def.icon} size={16} color={checked ? colors.accent : colors.inkMuted} />
      <Txt variant="subhead" tone={checked ? 'accent' : 'ink'} numberOfLines={1} style={styles.typeLabel}>
        {def.label}
      </Txt>
      {checked ? <Icon name="check" size={15} color={colors.accent} /> : null}
    </Pressable>
  );
}

/** Section-grouped type rows — shared by the slash, insert and turn-into menus.
 *  Sections keep the canonical {@link BLOCK_SECTIONS} order; `items` may already
 *  be filtered (slash query), in which case empty sections drop out. */
function TypeRows({
  items,
  current,
  activeId,
  onSelect,
  onRowLayout,
}: {
  items: BlockTypeDef[];
  current?: BlockType;
  /** The keyboard-highlighted def's type (slash menu). */
  activeId?: BlockType;
  onSelect: (def: BlockTypeDef) => void;
  /** Reports each row's y (slash menu keeps the active row scrolled into view). */
  onRowLayout?: (type: BlockType, y: number) => void;
}) {
  return (
    <>
      {BLOCK_SECTIONS.map((section) => {
        const defs = items.filter((d) => d.section === section.id);
        if (defs.length === 0) return null;
        return (
          <View key={section.id}>
            <MenuLabel>{section.label}</MenuLabel>
            {defs.map((def) => (
              <View key={def.type} onLayout={onRowLayout ? (e) => onRowLayout(def.type, e.nativeEvent.layout.y) : undefined}>
                <TypeRow def={def} active={activeId === def.type} checked={current === def.type} onSelect={onSelect} />
              </View>
            ))}
          </View>
        );
      })}
    </>
  );
}

/* ────────────────────────────── slash menu ─────────────────────────────── */

interface SlashMenuProps {
  visible: boolean;
  /** Filtered defs (the editor runs `filterBlockTypes(query)`); flattened in
   *  SECTION order — the same order `activeIndex` indexes into. */
  items: BlockTypeDef[];
  /** Keyboard highlight, an index into the section-ordered flattening of `items`. */
  activeIndex: number;
  /** Card's `top` inside the editor's blocks container (the active row's bottom). */
  top: number;
  onSelect: (def: BlockTypeDef) => void;
  onClose: () => void;
}

/** Flatten `items` in the same section order {@link TypeRows} renders, so the
 *  editor's ArrowUp/Down index and the painted highlight agree. */
export function flattenBySection(items: BlockTypeDef[]): BlockTypeDef[] {
  return BLOCK_SECTIONS.flatMap((s) => items.filter((d) => d.section === s.id));
}

/**
 * The "/" command menu. On wide screens it is deliberately NOT a Modal/Popover:
 * react-native-web's Modal traps focus, which would blur the editing field and
 * end the edit — the exact flash this rewrite removes. Instead it renders as an
 * absolutely-positioned card INSIDE the editor's blocks container (the page
 * already scrolls; the card hangs off the active row like Notion's). The field
 * keeps DOM focus the whole time and routes ArrowUp/Down/Enter/Esc here via
 * `onKeyDownCapture`. A `mousedown` on the card is prevented from stealing
 * focus so a click-select doesn't blur-close the editor first.
 *
 * On narrow screens it falls back to a bottom {@link Sheet} (the keyboard yields
 * to the sheet; tapping a row converts and re-opens the block).
 */
export function SlashMenu({ visible, items, activeIndex, top, onSelect, onClose }: SlashMenuProps) {
  const { colors } = useTheme();
  const { isWide, height } = useResponsive();
  const scrollRef = useRef<ScrollView>(null);
  const rowYs = useRef(new Map<BlockType, number>());
  const flat = flattenBySection(items);
  const active = flat[Math.max(0, Math.min(activeIndex, flat.length - 1))];

  // Keep the keyboard-highlighted row in view (filtering usually shortens the
  // list below the fold anyway; this covers browsing the full list with arrows).
  useEffect(() => {
    if (!visible || !active) return;
    const y = rowYs.current.get(active.type);
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.xxl), animated: false });
  }, [visible, active]);

  if (!visible) return null;

  if (!isWide) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Insert block">
        {flat.length === 0 ? (
          <Txt variant="callout" tone="inkMuted" center style={styles.empty}>
            No matching block
          </Txt>
        ) : (
          <TypeRows items={items} activeId={active?.type} onSelect={onSelect} />
        )}
      </Sheet>
    );
  }

  // Web-only: keep a click on the card from moving DOM focus (which would blur
  // the editing field and close the editor before the row's onPress lands).
  const keepFocusProps = (Platform.OS === 'web'
    ? { onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() }
    : {}) as Partial<ViewProps>;

  return (
    <View
      {...keepFocusProps}
      style={[
        styles.slashCard,
        paperBorder(colors),
        dropShadow(colors.shadow, 'md'),
        { top, maxHeight: Math.round(height * 0.4) },
      ]}
    >
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {flat.length === 0 ? (
          <Txt variant="callout" tone="inkMuted" style={styles.empty}>
            No matching block — Esc to dismiss
          </Txt>
        ) : (
          <TypeRows
            items={items}
            activeId={active?.type}
            onSelect={onSelect}
            onRowLayout={(t, y) => rowYs.current.set(t, y)}
          />
        )}
      </ScrollView>
    </View>
  );
}

/* ────────────────────────────── insert menu ────────────────────────────── */

interface InsertBlockMenuProps {
  visible: boolean;
  /** The gutter "+" that opened the menu (popover anchor on wide screens). */
  anchorRef: RefObject<ViewType | null>;
  onSelect: (def: BlockTypeDef) => void;
  onClose: () => void;
}

/** The gutter "+" picker: every insertable type, sectioned — anchored Popover on
 *  wide screens, bottom Sheet on phones. */
export function InsertBlockMenu({ visible, anchorRef, onSelect, onClose }: InsertBlockMenuProps) {
  const { isWide } = useResponsive();
  const body = <TypeRows items={BLOCK_TYPES} onSelect={onSelect} />;
  if (isWide) {
    return (
      <Popover visible={visible} onClose={onClose} anchorRef={anchorRef} placement="bottom-start" width={layout.blockMenuWidth}>
        <Menu>{body}</Menu>
      </Popover>
    );
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Add block">
      {body}
    </Sheet>
  );
}

/* ────────────────────────────── handle menu ────────────────────────────── */

interface BlockHandleMenuProps {
  visible: boolean;
  /** The gutter grip that opened the menu (popover anchor on wide screens). */
  anchorRef: RefObject<ViewType | null>;
  /** The block's current type — checked in the "Turn into" section. */
  currentType: BlockType;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Page-link blocks have no meaningful duplicate/turn-into (their content lives
   *  in the linked Object) — the menu collapses to move/delete for them. */
  onDuplicate?: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onTurnInto?: (def: BlockTypeDef) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * The block handle (grip) menu: structural actions over the block plus a
 * "Turn into" section — Notion's handle menu, on the shared {@link Menu}
 * vocabulary. Popover on wide screens, Sheet on phones (the same long-press /
 * grip target opens both, so every action has a touch path).
 */
export function BlockHandleMenu({
  visible,
  anchorRef,
  currentType,
  canMoveUp,
  canMoveDown,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onTurnInto,
  onDelete,
  onClose,
}: BlockHandleMenuProps) {
  const { isWide } = useResponsive();

  const body = (
    <Menu>
      {onDuplicate ? <MenuItem icon="duplicate" label="Duplicate" onPress={onDuplicate} /> : null}
      <MenuItem icon="arrow-up" label="Move up" shortcut="⌥↑" disabled={!canMoveUp} onPress={onMoveUp} />
      <MenuItem icon="arrow-down" label="Move down" shortcut="⌥↓" disabled={!canMoveDown} onPress={onMoveDown} />
      <MenuItem icon="trash" label="Delete" danger onPress={onDelete} />
      {onTurnInto ? (
        <>
          <MenuSeparator />
          <MenuLabel>Turn into</MenuLabel>
          {BLOCK_TYPES
            .filter((d) => !REF_BLOCK_TYPES.has(d.type)) // ref-blocks can't be turned into inline types
            .map((def) => (
              <TypeRow key={def.type} def={def} checked={def.type === currentType} onSelect={onTurnInto} />
            ))}
        </>
      ) : null}
    </Menu>
  );

  if (isWide) {
    return (
      <Popover visible={visible} onClose={onClose} anchorRef={anchorRef} placement="bottom-start" width={layout.blockMenuWidth}>
        {body}
      </Popover>
    );
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Block">
      {body}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    // Touch keeps the tap-target floor; web stays dense (Notion-tight rows).
    minHeight: Platform.OS === 'web' ? undefined : spacing.controlMinHeight,
  },
  typeLabel: { flex: 1 },
  // The inline slash card: positioned by the editor inside its blocks container,
  // aligned with the text column (past the handle gutter).
  slashCard: {
    position: 'absolute',
    left: layout.blockGutterWidth,
    width: layout.blockMenuWidth,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.xs,
    zIndex: layers.popover,
  },
  empty: { padding: spacing.lg },
});
