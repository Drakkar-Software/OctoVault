import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, Ref, RefObject } from 'react';
import type { View as ViewType } from 'react-native';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { layout, radii, spacing } from '@/theme';
import { tapFeedback } from '@/lib/haptics';
import { useHover, useRowHover } from '@/lib/use-hover';
import { useInlineEdit, type InlineEdit } from '@/lib/use-inline-edit';
import { useResponsive } from '@/lib/use-responsive';
import { useTheme } from '@/lib/use-theme';
import { useTypeRegistry } from '@/lib/type-registry-context';
import type { ObjectTreeNode } from '@drakkar.software/octovault-sdk';
import type { ID, ObjectType } from '@drakkar.software/octovault-sdk';
import { AutosaveField } from '@/components/ui/AutosaveField';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';
import { Sheet } from '@/components/ui/Sheet';
import { Tooltip } from '@/components/ui/Tooltip';
import { Txt } from '@/components/ui/Txt';

/**
 * The full verb set a tree row's "⋯" menu exposes. Pure callbacks — the owner
 * (WorkObjects) wires them onto the shared `useSpaceObjects` store, shows the
 * archive Undo toast, expands parents after a child create, etc. The tree stays
 * a presentation layer that never touches the index itself.
 */
export interface ObjectTreeActions {
  /** Create a child of `type` under the row (owner expands the parent + navigates). */
  addChild: (node: ObjectTreeNode, type: ObjectType) => void;
  /** Persist a non-empty title typed into the in-row rename field. */
  rename: (node: ObjectTreeNode, title: string) => void;
  /** Reparent to `parentId` (`null` = workspace root). Cycle-safety lives in the reducer. */
  moveTo: (node: ObjectTreeNode, parentId: ID | null) => void;
  moveUp: (node: ObjectTreeNode) => void;
  moveDown: (node: ObjectTreeNode) => void;
  duplicate: (node: ObjectTreeNode) => void;
  /** Web-only share path — provide only where a routable origin exists. */
  copyLink?: (node: ObjectTreeNode) => void;
  /** Soft delete (cascades); the OWNER shows the toast with Undo. */
  archive: (node: ObjectTreeNode) => void;
}

interface ObjectTreeProps {
  nodes: ObjectTreeNode[];
  onOpen: (node: ObjectTreeNode) => void;
  /** Ids collapsed on this device (state lives in the caller — see
   *  `useTreeCollapse` in `lib/use-tree-collapse.ts` for the persisted version). */
  collapsed: Set<ID>;
  onToggle: (id: ID) => void;
  /** Legacy simple add-child "+" (no row menu). Superseded by `actions`; kept so
   *  callers that only want a quick page-under "+" keep working unchanged. */
  onAddChild?: (node: ObjectTreeNode) => void;
  /** Types that are pure containers (folders): pressing toggles instead of opening a
   *  content route. `category` is always treated as a container header. */
  isContainer?: (type: string) => boolean;
  /** The object open in the main pane — its row gets the accent highlight and its
   *  collapsed ancestors auto-expand so the selection is always visible. */
  selectedId?: ID;
  /** Enables the per-row controls: hover "+"/"⋯" on web, an always-visible dim "⋯"
   *  plus row long-press on native (hover affordances need a touch path). */
  actions?: ObjectTreeActions;
}

/** Everything a row needs, bundled once at the top so the recursion doesn't
 *  re-thread eight props per level. One object per render — rows are cheap. */
interface TreeCtx {
  onOpen: (node: ObjectTreeNode) => void;
  collapsed: Set<ID>;
  onToggle: (id: ID) => void;
  onAddChild?: (node: ObjectTreeNode) => void;
  isContainer?: (type: string) => boolean;
  selectedId?: ID;
  actions?: ObjectTreeActions;
  /** The full forest — the "Move to…" picker lists targets from it. */
  roots: ObjectTreeNode[];
  /** One row renamed at a time; opening another closes the first. */
  edit: InlineEdit;
  /** Measured once at the top (a Dimensions listener per row would be waste). */
  isWide: boolean;
}

/** Root→node ancestor id chain (EXCLUSIVE of the node) within the rendered
 *  forest, or null when the node isn't in it yet (index still loading). */
function pathTo(nodes: ObjectTreeNode[], id: ID, trail: ID[] = []): ID[] | null {
  for (const n of nodes) {
    if (n.id === id) return trail;
    const found = pathTo(n.children, id, [...trail, n.id]);
    if (found) return found;
  }
  return null;
}

/**
 * Recursive, collapsible object tree — the sidebar + Vault surface for the unified
 * {@link ObjectTreeNode} model. Rows indent by depth; a node with children shows a
 * disclosure chevron that toggles its subtree. Beyond plain navigation it carries
 * the Notion row grammar: a `selectedId` highlight, hover-revealed "+"/"⋯" controls
 * on web with a long-press + visible-"⋯" path on native, an anchored context menu
 * (rename in place, add sub-page/board, move, duplicate, archive) and a "Move to…"
 * tree picker. All mutations flow OUT through {@link ObjectTreeActions} — the tree
 * itself stays pure composition over `Icon`/`Txt`/`Menu` + theme tokens.
 */
export function ObjectTree({ nodes, onOpen, collapsed, onToggle, onAddChild, isContainer, selectedId, actions }: ObjectTreeProps) {
  const edit = useInlineEdit();
  const { isWide } = useResponsive();

  // Auto-expand the selection's ancestors so the highlighted row is visible.
  // No dep array: the guard makes re-runs free, and the index can land AFTER the
  // selection (deep link → tree loads later), so we retry until the path resolves
  // and only then latch the id.
  const revealedFor = useRef<ID | null>(null);
  useEffect(() => {
    if (!selectedId || revealedFor.current === selectedId) return;
    const path = pathTo(nodes, selectedId);
    if (path == null) return; // not in this forest yet — retry next render
    revealedFor.current = selectedId;
    for (const id of path) if (collapsed.has(id)) onToggle(id);
  });

  const ctx: TreeCtx = { onOpen, collapsed, onToggle, onAddChild, isContainer, selectedId, actions, roots: nodes, edit, isWide };
  return <TreeLevel nodes={nodes} ctx={ctx} />;
}

function TreeLevel({ nodes, ctx }: { nodes: ObjectTreeNode[]; ctx: TreeCtx }) {
  return (
    <View>
      {nodes.map((node, i) => (
        <ObjectTreeRow key={node.id} node={node} isFirst={i === 0} isLast={i === nodes.length - 1} ctx={ctx} />
      ))}
    </View>
  );
}

interface RowProps {
  node: ObjectTreeNode;
  /** Position among rendered siblings — disables Move up/down at the run's edges. */
  isFirst: boolean;
  isLast: boolean;
  ctx: TreeCtx;
}

function ObjectTreeRow({ node, isFirst, isLast, ctx }: RowProps) {
  const { colors } = useTheme();
  const registry = useTypeRegistry();
  // Rows are plain Views (not Pressables, to keep text selection), so hover must use
  // onMouseEnter/onMouseLeave (useRowHover) — RN-web does NOT forward Pressable-style
  // onHoverIn on a View, which previously left rows un-hoverable and hid the add-child "+".
  const { hovered, hoverProps } = useRowHover();
  const [menuOpen, setMenuOpen] = useState(false);
  /** Which content panel the single overlay is showing. */
  const [menuView, setMenuView] = useState<'actions' | 'move'>('actions');
  // Overlays stay unmounted until first use: a large tree renders hundreds of rows
  // and a per-row Sheet/Popover (reanimated values, Dimensions listeners) would be
  // real weight. Once opened the surface stays mounted so its exit animation plays.
  const [surfacesMounted, setSurfacesMounted] = useState(false);
  const dotsRef = useRef<ViewType>(null);

  const hasChildren = node.children.length > 0;
  const isCollapsed = ctx.collapsed.has(node.id);
  const isCategory = registry.isContainerType(node.type) || (ctx.isContainer?.(node.type) ?? false);
  const container = isCategory;
  const selected = ctx.selectedId === node.id;
  const editing = ctx.edit.isEditing(node.id);
  const { actions } = ctx;

  const open = useCallback(() => {
    if (container) ctx.onToggle(node.id);
    else ctx.onOpen(node);
  }, [container, node, ctx]);

  const openMenu = useCallback(() => {
    tapFeedback();
    setSurfacesMounted(true);
    setMenuView('actions');
    setMenuOpen(true);
  }, []);

  // Web reveals controls on hover (kept while a menu is open so the anchor doesn't
  // vanish under its own popover); native always shows a dim "⋯" — hover-only
  // affordances are unreachable on touch, and long-press is invisible without it.
  const controlsVisible = !!actions && !isCategory && !editing && (Platform.OS === 'web' ? hovered || menuOpen : true);

  // Selected rows hold a persistent accent wash; hover layers one step deeper.
  const rowBg = selected
    ? hovered || menuOpen
      ? colors.accentBgStrong
      : colors.accentBg
    : hovered || menuOpen
      ? colors.hover
      : 'transparent';

  const labelTone = selected ? 'accentInk' : node.title ? undefined : 'inkMuted';

  return (
    <>
      <View {...hoverProps} style={[styles.row, { paddingLeft: spacing.xs + node.depth * layout.objectTreeIndent, backgroundColor: rowBg }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isCollapsed ? 'Expand' : 'Collapse'}
          hitSlop={6}
          onPress={hasChildren || container ? () => ctx.onToggle(node.id) : undefined}
          style={styles.disclosure}
        >
          {hasChildren ? (
            <View style={isCollapsed ? undefined : styles.chevOpen}>
              <Icon name="chev" size={12} color={selected ? colors.accent : colors.inkFaint} />
            </View>
          ) : null}
        </Pressable>
        {editing && actions ? (
          // In-row rename: the label swaps for a borderless autosave field; blur /
          // Enter / Escape close it and the debounced commit persists non-empty text.
          <AutosaveField
            initialText={node.title}
            placeholder="Untitled"
            textVariant="subhead"
            plain
            onCommit={(text) => actions.rename(node, text)}
            onClose={ctx.edit.close}
            accessibilityLabel={`Rename ${node.title || 'Untitled'}`}
            containerStyle={styles.editField}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={node.title || 'Untitled'}
            accessibilityState={{ selected }}
            onPress={open}
            onLongPress={actions && !isCategory ? openMenu : undefined}
            style={styles.content}
          >
            {node.emoji ? (
              <Txt variant="subhead" style={styles.emoji}>
                {node.emoji}
              </Txt>
            ) : (
              <View style={styles.leafIcon}>
                <Icon name={registry.iconForNode(node)} size={13} color={selected ? colors.accent : colors.inkMuted} />
              </View>
            )}
            <Txt
              variant={isCategory ? 'caption' : 'subhead'}
              weight={isCategory ? 'bold' : selected ? 'medium' : undefined}
              tone={isCategory ? 'inkMuted' : labelTone}
              numberOfLines={1}
              style={styles.label}
            >
              {isCategory ? node.title.toUpperCase() : node.title || 'Untitled'}
            </Txt>
          </Pressable>
        )}
        {controlsVisible ? (
          <View style={styles.controls}>
            {Platform.OS === 'web' ? (
              <RowControl icon="plus" label={`Add a page inside ${node.title || 'Untitled'}`} tooltip="Add a page inside" onPress={() => actions!.addChild(node, registry.creatableTypes().find((d) => d.workTree)?.type ?? 'page')} />
            ) : null}
            <RowControl
              icon="dots"
              label={`Actions for ${node.title || 'Untitled'}`}
              tooltip="More actions"
              onPress={openMenu}
              innerRef={dotsRef}
              // Quieter at rest on native (always visible); web only shows it on hover.
              dim={Platform.OS !== 'web'}
            />
          </View>
        ) : !actions && ctx.onAddChild && hovered && !isCategory ? (
          // Legacy hover "+" for callers that never adopted the row menu.
          <RowControl icon="plus" label={`Add a page inside ${node.title}`} tooltip="Add a page inside" onPress={() => ctx.onAddChild!(node)} />
        ) : null}
      </View>
      {surfacesMounted && actions ? (
        // One adaptive surface (Popover on wide, Sheet on narrow) that swaps
        // between the action list and the move-target list in-place. This avoids
        // the two-Modal race on native: with two sibling Sheet/Modals, closing one
        // and opening the other in the same tick caused the incoming Modal to
        // silently fail to present on iOS/Android (exit animation of the first
        // kept it mounted while the second tried to mount). One surface, no race.
        <RowMenu
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorRef={dotsRef}
          isWide={ctx.isWide}
          title={menuView === 'move' ? 'Move to' : node.title || 'Untitled'}
          onBack={menuView === 'move' ? () => setMenuView('actions') : undefined}
          width={menuView === 'move' ? layout.popoverWidth : undefined}
        >
          {menuView === 'move' ? (
            <MoveToList
              node={node}
              roots={ctx.roots}
              onPick={(parentId) => {
                setMenuOpen(false);
                actions.moveTo(node, parentId);
              }}
            />
          ) : (
            <Menu>
              <MenuItem icon="edit" label="Rename" onPress={() => { setMenuOpen(false); ctx.edit.begin(node.id); }} />
              {registry.creatableTypes().filter((d) => d.workTree && d.editor !== 'file').map((d) => (
                <MenuItem key={d.type} icon={d.icon} label={`Add sub-${d.label.toLowerCase()}`} onPress={() => { setMenuOpen(false); actions.addChild(node, d.type); }} />
              ))}
              <MenuSeparator />
              <MenuItem icon="move-to" label="Move to…" onPress={() => setMenuView('move')} />
              <MenuItem icon="arrow-up" label="Move up" disabled={isFirst} onPress={() => { setMenuOpen(false); actions.moveUp(node); }} />
              <MenuItem icon="arrow-down" label="Move down" disabled={isLast} onPress={() => { setMenuOpen(false); actions.moveDown(node); }} />
              <MenuItem icon="duplicate" label="Duplicate" onPress={() => { setMenuOpen(false); actions.duplicate(node); }} />
              {actions.copyLink ? (
                <MenuItem icon="link" label="Copy link" onPress={() => { setMenuOpen(false); actions.copyLink!(node); }} />
              ) : null}
              <MenuSeparator />
              <MenuItem icon="trash" label="Archive" danger onPress={() => { setMenuOpen(false); actions.archive(node); }} />
            </Menu>
          )}
        </RowMenu>
      ) : null}
      {hasChildren && !isCollapsed ? <TreeLevel nodes={node.children} ctx={ctx} /> : null}
    </>
  );
}

interface RowControlProps {
  icon: IconName;
  /** Full accessibility label (names the row). */
  label: string;
  /** Short hover hint; the Tooltip renders web-only. */
  tooltip: string;
  onPress: () => void;
  innerRef?: Ref<ViewType>;
  /** Faint at rest — the always-visible native "⋯" must not shout on every row. */
  dim?: boolean;
}

/** One small square row control ("+" / "⋯") with hover + pressed washes. Kept at
 *  `layout.rowAddButton` visually but hit-slopped out to a comfortable target. */
function RowControl({ icon, label, tooltip, onPress, innerRef, dim = false }: RowControlProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Tooltip label={tooltip}>
      <Pressable
        ref={innerRef}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={10}
        onPress={onPress}
        {...hoverProps}
        style={({ pressed }) => [
          styles.ctl,
          { backgroundColor: pressed ? colors.pressed : hovered ? colors.hover : 'transparent' },
        ]}
      >
        <Icon name={icon} size={13} color={dim && !hovered ? colors.inkFaint : colors.inkMuted} />
      </Pressable>
    </Tooltip>
  );
}

interface RowMenuProps {
  visible: boolean;
  onClose: () => void;
  anchorRef: RefObject<ViewType | null>;
  isWide: boolean;
  /** Bottom-sheet header on narrow screens (the popover needs no title). */
  title: string;
  /** Back button rendered in the sheet header — lets sub-views navigate back
   *  without closing and reopening the Modal. Popover has no header so this is
   *  narrow/native only. */
  onBack?: () => void;
  /** Fixed card width forwarded to the wide Popover (e.g. move-target list
   *  needs a wider card than the default action menu). */
  width?: number;
  children: ReactNode;
}

/** Presentation shell for a row's context menu: anchored popover on wide screens,
 *  bottom sheet on narrow ones — one menu definition serves both. */
function RowMenu({ visible, onClose, anchorRef, isWide, title, onBack, width, children }: RowMenuProps) {
  if (isWide) {
    return (
      <Popover visible={visible} onClose={onClose} anchorRef={anchorRef} placement="bottom-end" width={width}>
        {children}
      </Popover>
    );
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={title} onBack={onBack}>
      {children}
    </Sheet>
  );
}

interface MoveToListProps {
  /** The node being moved — its own subtree is excluded (a cycle) and its current
   *  parent renders checked. */
  node: ObjectTreeNode;
  roots: ObjectTreeNode[];
  onPick: (parentId: ID | null) => void;
}

/** Ids of a rendered subtree (the moved node + descendants) — invalid drop targets. */
function subtreeOf(node: ObjectTreeNode): Set<ID> {
  const out = new Set<ID>();
  const walk = (n: ObjectTreeNode) => {
    out.add(n.id);
    for (const c of n.children) walk(c);
  };
  walk(node);
  return out;
}

/** Depth-first flatten of every valid target, keeping `depth` for indentation. */
function flattenTargets(roots: ObjectTreeNode[], excluded: Set<ID>): ObjectTreeNode[] {
  const out: ObjectTreeNode[] = [];
  const walk = (nodes: ObjectTreeNode[]) => {
    for (const n of nodes) {
      if (excluded.has(n.id)) continue; // moving under yourself would cycle
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/**
 * Content-only "Move to" target list — rendered inside the shared `RowMenu`
 * surface (Popover or Sheet). Surface ownership lives in the row so only one
 * Modal ever exists; swapping `menuView` between `'actions'` and `'move'` avoids
 * the two-Modal overlap race that prevented the picker from appearing on native.
 */
function MoveToList({ node, roots, onPick }: MoveToListProps) {
  const targets = useMemo(() => flattenTargets(roots, subtreeOf(node)), [roots, node]);
  return (
    <Menu>
      <MenuItem icon="layers" label="Workspace" checked={node.parentId == null} onPress={() => onPick(null)} />
      {targets.map((t) => (
        <View key={t.id} style={{ paddingLeft: t.depth * layout.objectTreeIndent }}>
          <MenuItem
            label={`${t.emoji ? `${t.emoji} ` : ''}${t.title || 'Untitled'}`}
            checked={node.parentId === t.id}
            onPress={() => onPick(t.id)}
          />
        </View>
      ))}
    </Menu>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, height: layout.objectTreeRowHeight, paddingRight: spacing.xs, borderRadius: radii.md },
  content: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  disclosure: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  chevOpen: { transform: [{ rotate: '90deg' }] },
  emoji: { width: 18, textAlign: 'center' },
  leafIcon: { width: 18, alignItems: 'center' },
  label: { flex: 1, minWidth: 0, letterSpacing: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctl: { width: layout.rowAddButton, height: layout.rowAddButton, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  editField: { flex: 1, minWidth: 0 },
});
