import { Fragment, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, TextInputKeyPressEventData, View as ViewType, ViewProps } from 'react-native';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { layout, opacity, paperBorder, radii, shadows, spacing } from '@/theme';
import type { BoardHook, Column, Task } from '@/lib/use-board';
import { orderBetween, useBoard } from '@/lib/use-board';
import { useBoardDrag, type BoardDrag } from '@/lib/use-board-drag';
import { tapFeedback } from '@/lib/haptics';
import { useConfirm } from '@/lib/use-confirm';
import { useHover, useRowHover } from '@/lib/use-hover';
import { useResponsive } from '@/lib/use-responsive';
import { useTheme } from '@/lib/use-theme';
import { AutosaveField } from '@/components/ui/AutosaveField';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { EmojiPicker } from '@/components/ui/EmojiPicker';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';
import { AdaptiveMenu } from '@/components/ui/AdaptiveMenu';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { Txt } from '@/components/ui/Txt';
import { ObjectHero } from '@/components/work/ObjectHero';

/** react-native-web forwards the keydown event, so `preventDefault` and the
 *  composition flag live on it even though RN's type only promises `key`. */
type WebKeyEvent = NativeSyntheticEvent<TextInputKeyPressEventData> & {
  preventDefault?: () => void;
  nativeEvent: TextInputKeyPressEventData & { isComposing?: boolean };
};

interface BoardViewProps {
  spaceId: string;
  objectId: string;
  emoji?: string;
  title?: string;
  onRenameTitle?: (text: string) => void;
  /** Persist an icon change from the hero's EmojiPicker (`null` removes it). */
  onChangeEmoji?: (emoji: string | null) => void;
  /** Set on the CREATING device only (route flag from the create flow): seeds
   *  To do / In progress / Done on the first ready tick of an empty board —
   *  flag-gated so two devices opening the same new board can't both seed. */
  seedDefaults?: boolean;
  /** Create flow (`focusTitle=1`): mount the hero's title editor immediately so
   *  naming the brand-new board is zero extra taps. */
  focusTitle?: boolean;
}

/**
 * Live kanban board for one `board` Object — columns + cards over a
 * {@link useBoard} WAL/CRDT document. Every gesture (inline card composer,
 * column menus, web pointer drag, done toggles) folds to idempotent CRDT ops,
 * so two devices converge after a pull. Done-ness follows the column (see
 * board-model): the flagged "Done" column IS the property, Notion-style.
 * Title/emoji live on the index node (hero + EmojiPicker edit them in place).
 */
export function BoardView({ spaceId, objectId, emoji, title, onRenameTitle, onChangeEmoji, seedDefaults = false, focusTitle = false }: BoardViewProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { isWide } = useResponsive();
  const board = useBoard(spaceId, objectId);
  const toast = useToast();
  const { columns, tasksByColumn, done, total } = board.board;

  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const heroRef = useRef<ViewType>(null);
  const stripRef = useRef<ScrollView>(null);

  // ── Seed the starter columns (creating device only, exactly once) ─────────
  const seededRef = useRef(false);
  const aboutToSeed = seedDefaults && !seededRef.current && columns.length === 0 && total === 0;
  useEffect(() => {
    if (!seedDefaults || seededRef.current || !board.ready) return;
    seededRef.current = true;
    if (columns.length === 0 && total === 0) board.seedColumns();
  }, [seedDefaults, board, columns.length, total]);

  // ── Card mutations shared by face, menus, drag and the detail peek ────────

  /** Append a card after the target column's last card (excluding itself). */
  const moveToEnd = (taskId: string, columnId: string) => {
    const last = (tasksByColumn[columnId] ?? []).filter((t) => t.id !== taskId).at(-1);
    board.moveTask(taskId, columnId, orderBetween(last?.order, undefined));
  };

  /**
   * The unified done toggle. With a Done column the column IS the property, so
   * toggling MOVES the card (in/out of the Done group); the legacy `status`
   * register is still written so older clients keep agreeing. Boards without
   * a Done column keep the old status-flip behavior.
   */
  const toggleDone = (task: Task) => {
    tapFeedback();
    const doneCol = columns.find((c) => c.done);
    if (!doneCol) {
      board.changeStatus(task.id, task.done ? 'todo' : 'done');
      return;
    }
    if (task.done) {
      board.changeStatus(task.id, 'todo');
      const firstOpen = columns.find((c) => !c.done);
      if (firstOpen && columns.find((c) => c.id === task.columnId)?.done) moveToEnd(task.id, firstOpen.id);
    } else {
      board.changeStatus(task.id, 'done');
      moveToEnd(task.id, doneCol.id);
    }
  };

  /** Swap with the neighbor above/below via one fractional-order write. */
  const nudgeTask = (task: Task, dir: -1 | 1) => {
    const list = tasksByColumn[task.columnId] ?? [];
    const i = list.findIndex((t) => t.id === task.id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= list.length) return;
    const neighbor = list[j]!;
    const beyond = list[j + dir];
    board.moveTask(
      task.id,
      task.columnId,
      dir === -1 ? orderBetween(beyond?.order, neighbor.order) : orderBetween(neighbor.order, beyond?.order),
    );
  };

  const duplicateTask = (task: Task) => {
    const list = tasksByColumn[task.columnId] ?? [];
    const next = list[list.findIndex((t) => t.id === task.id) + 1];
    board.duplicateTask(task, orderBetween(task.order, next?.order));
  };

  /** Delete with undo toast. */
  const deleteWithUndo = (task: Task) => {
    board.deleteTask(task.id);
    toast.show({ message: 'Card deleted', action: { label: 'Undo', onPress: () => board.restoreTask(task) } });
  };

  // ── Web pointer drag (cards between/within columns) ───────────────────────
  const drag = useBoardDrag({
    columnIds: columns.map((c) => c.id),
    tasksByColumn,
    enabled: board.ready,
    onDrop: (taskId, columnId, index) => {
      const full = tasksByColumn[columnId] ?? [];
      const srcIdx = full.findIndex((t) => t.id === taskId);
      const without = srcIdx === -1 ? full : full.filter((t) => t.id !== taskId);
      // The hook's index counts the dragged card when same-column; re-base it
      // onto the list WITHOUT the card so the neighbor math is exact.
      let i = index;
      if (srcIdx !== -1 && index > srcIdx) i -= 1;
      if (srcIdx !== -1 && i === srcIdx) return; // dropped back where it was
      board.moveTask(taskId, columnId, orderBetween(without[i - 1]?.order, without[i]?.order));
    },
  });

  // ── Strip edge fades (web): overflow must be visible, not discovered ──────
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

  const addColumn = () => {
    const id = board.addColumn('');
    if (!id) return;
    setEditingColId(id);
    // Let the new column mount, then bring it into view.
    setTimeout(() => stripRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const loading = (!board.ready && !board.openError) || aboutToSeed;

  return (
    <View style={styles.wrap}>
      <View ref={heroRef} collapsable={false}>
        <ObjectHero
          emoji={emoji}
          title={title}
          subtitle={total ? `${done} of ${total} done` : undefined}
          onChangeTitle={onRenameTitle}
          onPressIcon={onChangeEmoji ? () => setIconOpen(true) : undefined}
          focusTitle={focusTitle}
        />
      </View>
      <EmojiPicker
        visible={iconOpen}
        onClose={() => setIconOpen(false)}
        onSelect={(glyph) => onChangeEmoji?.(glyph)}
        anchorRef={heroRef}
        current={emoji || null}
      />

      {board.offline ? <Callout tone="info" iconName="info">Offline — showing the last synced board.</Callout> : null}
      {board.openError ? <Callout tone="danger" iconName="alert">{board.openError}</Callout> : null}

      {loading ? (
        <BoardSkeleton />
      ) : columns.length === 0 ? (
        <BoardEmpty onSeed={() => board.seedColumns()} onAddColumn={addColumn} />
      ) : (
        <View style={styles.stripWrap}>
          <ScrollView
            ref={stripRef}
            horizontal
            // Desktop mice can't shift-wheel-guess: the overflow must show.
            showsHorizontalScrollIndicator={Platform.OS === 'web'}
            // Phones: columns are wider than half the viewport — snap them so
            // a flick rests on a column instead of half-clipping two.
            snapToInterval={!isWide ? layout.boardColumnWidth + spacing.md : undefined}
            snapToAlignment="start"
            decelerationRate={!isWide ? 'fast' : undefined}
            onScroll={onStripScroll}
            scrollEventThrottle={32}
            onLayout={(e) => {
              stripSize.current.view = e.nativeEvent.layout.width;
              refreshFades();
            }}
            onContentSizeChange={(w) => {
              stripSize.current.content = w;
              refreshFades();
            }}
            contentContainerStyle={styles.columns}
          >
            {columns.map((col, i) => (
              <BoardColumn
                key={col.id}
                col={col}
                colIndex={i}
                columns={columns}
                tasks={tasksByColumn[col.id] ?? []}
                board={board}
                drag={drag}
                editing={editingColId === col.id}
                onEditStart={() => setEditingColId(col.id)}
                onEditEnd={() => setEditingColId((cur) => (cur === col.id ? null : cur))}
                onOpenTask={(id) => router.push({ pathname: '/work/object/[id]', params: { id, spaceId } })}
                onToggleDone={toggleDone}
                onMoveToColumn={moveToEnd}
                onNudge={nudgeTask}
                onDuplicate={duplicateTask}
                onDelete={deleteWithUndo}
              />
            ))}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add column"
              disabled={!board.ready}
              onPress={addColumn}
              style={[styles.addColumn, { borderColor: colors.lineSoft, opacity: board.ready ? 1 : opacity.disabled }]}
            >
              <Icon name="plus" size={15} color={colors.inkMuted} />
              <Txt variant="footnote" weight="medium" tone="inkMuted">Add column</Txt>
            </Pressable>
          </ScrollView>
          {Platform.OS === 'web' && fades.left ? (
            <LinearGradient
              pointerEvents="none"
              colors={[colors.canvas, 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.fade, styles.fadeLeft]}
            />
          ) : null}
          {Platform.OS === 'web' && fades.right ? (
            <LinearGradient
              pointerEvents="none"
              colors={['transparent', colors.canvas]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.fade, styles.fadeRight]}
            />
          ) : null}
        </View>
      )}

    </View>
  );
}

// ── Column ───────────────────────────────────────────────────────────────────

interface BoardColumnProps {
  col: Column;
  colIndex: number;
  columns: Column[];
  tasks: Task[];
  board: BoardHook;
  drag: BoardDrag;
  editing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
  onOpenTask: (taskId: string) => void;
  onToggleDone: (task: Task) => void;
  onMoveToColumn: (taskId: string, columnId: string) => void;
  onNudge: (task: Task, dir: -1 | 1) => void;
  onDuplicate: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/**
 * One kanban column: rename-in-place header with a hover-revealed add-to-top
 * `+` (web) and a `⋯` menu (always reachable on touch), the card stack (a drag
 * drop-zone), and the inline "+ New" composer at the foot. Column management —
 * move left/right, Done-column flag, delete with explicit card handling —
 * lives in the menu so the header stays quiet.
 */
function BoardColumn({ col, colIndex, columns, tasks, board, drag, editing, onEditStart, onEditEnd, onOpenTask, onToggleDone, onMoveToColumn, onNudge, onDuplicate, onDelete }: BoardColumnProps) {
  const { colors } = useTheme();
  const confirm = useConfirm();
  const head = useRowHover();
  const titleHover = useHover();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState(false);
  /** Composer position: header `+`/menu insert at the top, the foot row below. */
  const [composer, setComposer] = useState<'top' | 'bottom' | null>(null);
  const menuAnchor = useRef<ViewType>(null);

  const isDropTarget = !!drag.draggingId && drag.target?.columnId === col.id;
  const lineAt = (i: number) => isDropTarget && drag.target?.index === i;

  const commitNewCard = (title: string, position: 'top' | 'bottom') => {
    const order = position === 'top' ? orderBetween(undefined, tasks[0]?.order) : undefined;
    board.addTask(col.id, title, order);
  };

  const askDelete = async () => {
    setMenuOpen(false);
    if (tasks.length === 0) {
      const ok = await confirm({
        title: `Delete “${col.title || 'Untitled'}”?`,
        message: 'The column is empty — nothing else is removed.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) board.deleteColumn(col.id);
      return;
    }
    setDeleteAsk(true); // cards need an explicit destination — never decide silently
  };

  const rehomeTarget = columns.find((c) => c.id !== col.id);
  const cardWord = tasks.length === 1 ? '1 card' : `${tasks.length} cards`;

  return (
    <View
      {...head.hoverProps}
      style={[
        styles.column,
        paperBorder(colors),
        shadows.sm,
        isDropTarget && { backgroundColor: colors.dropTarget },
      ]}
    >
      <View style={styles.colHead}>
        {editing ? (
          <View style={styles.colTitle}>
            <AutosaveField
              initialText={col.title}
              autoFocus
              placeholder="Name this column"
              onCommit={(t) => {
                const v = t.trim();
                if (v) board.renameColumn(col.id, v);
              }}
              onClose={onEditEnd}
              accessibilityLabel={`Rename column ${col.title || 'Untitled'}`}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Rename column ${col.title || 'Untitled'}`}
            onPress={onEditStart}
            {...titleHover.hoverProps}
            style={[styles.colTitle, styles.colTitleHit, titleHover.hovered && { backgroundColor: colors.hover }]}
          >
            <Txt variant="caption" weight="bold" tone={col.title ? 'inkMuted' : 'inkFaint'} numberOfLines={1}>
              {(col.title || 'Untitled').toUpperCase()}
            </Txt>
            {col.done ? <Icon name="check" size={11} color={colors.success} /> : null}
          </Pressable>
        )}
        <Txt variant="micro" mono tone="inkFaint">{tasks.length}</Txt>
        {!editing ? (
          <View style={[styles.colActions, Platform.OS === 'web' && !head.hovered && !menuOpen ? styles.colActionsHidden : null]} pointerEvents={Platform.OS === 'web' && !head.hovered && !menuOpen ? 'none' : 'auto'}>
            {Platform.OS === 'web' ? (
              <IconButton name="plus" size={14} onPress={() => setComposer('top')} tooltip="Add card to top" accessibilityLabel="Add card to top" />
            ) : null}
            <View ref={menuAnchor} collapsable={false}>
              <IconButton name="dots" size={14} color={colors.inkMuted} onPress={() => setMenuOpen(true)} tooltip="Column options" accessibilityLabel={`Options for ${col.title || 'Untitled'}`} />
            </View>
          </View>
        ) : null}
      </View>

      {composer === 'top' ? (
        <CardComposer onSubmit={(t) => commitNewCard(t, 'top')} onClose={() => setComposer(null)} />
      ) : null}

      <View ref={(v) => drag.registerColumn(col.id, v)} collapsable={false} style={styles.cards}>
        {tasks.map((task, i) => (
          <Fragment key={task.id}>
            {lineAt(i) ? <View style={[styles.dropLine, { backgroundColor: colors.accent }]} /> : null}
            <TaskCard
              task={task}
              columnId={col.id}
              columns={columns}
              index={i}
              count={tasks.length}
              drag={drag}
              dragging={drag.draggingId === task.id}
              onOpen={() => onOpenTask(task.id)}
              onToggleDone={() => onToggleDone(task)}
              onMoveToColumn={(cid) => onMoveToColumn(task.id, cid)}
              onNudge={(dir) => onNudge(task, dir)}
              onDuplicate={() => onDuplicate(task)}
              onDelete={() => onDelete(task)}
            />
          </Fragment>
        ))}
        {lineAt(tasks.length) ? <View style={[styles.dropLine, { backgroundColor: colors.accent }]} /> : null}
      </View>

      {composer === 'bottom' ? (
        <CardComposer onSubmit={(t) => commitNewCard(t, 'bottom')} onClose={() => setComposer(null)} />
      ) : (
        <AddCardRow disabled={!board.ready} onPress={() => setComposer('bottom')} />
      )}

      <AdaptiveMenu visible={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuAnchor} title={col.title || 'Column'}>
        <Menu>
          <MenuItem icon="edit" label="Rename" onPress={() => { setMenuOpen(false); onEditStart(); }} />
          <MenuItem icon="plus" label="Add card" onPress={() => { setMenuOpen(false); setComposer('top'); }} />
          <MenuSeparator />
          <MenuItem icon="arrow-l" label="Move left" disabled={colIndex === 0} onPress={() => { setMenuOpen(false); board.moveColumn(col.id, colIndex - 1); }} />
          <MenuItem icon="arrow-r" label="Move right" disabled={colIndex === columns.length - 1} onPress={() => { setMenuOpen(false); board.moveColumn(col.id, colIndex + 1); }} />
          <MenuSeparator />
          <MenuItem
            icon="square-check"
            label="Done column"
            checked={col.done}
            onPress={() => { setMenuOpen(false); board.setColumnDone(col.id, !col.done); }}
          />
          <MenuSeparator />
          <MenuItem icon="trash" label="Delete column" danger onPress={askDelete} />
        </Menu>
      </AdaptiveMenu>

      <Sheet visible={deleteAsk} onClose={() => setDeleteAsk(false)} title={`Delete “${col.title || 'Untitled'}”?`}>
        <Txt variant="body" tone="inkSoft">
          It holds {cardWord}. Choose what happens to {tasks.length === 1 ? 'it' : 'them'}.
        </Txt>
        <Menu>
          {rehomeTarget ? (
            <MenuItem
              icon="move-to"
              label={`Move ${cardWord} to “${rehomeTarget.title || 'Untitled'}”`}
              onPress={() => {
                setDeleteAsk(false);
                board.deleteColumn(col.id, { moveTasksTo: rehomeTarget.id });
              }}
            />
          ) : null}
          <MenuItem
            icon="trash"
            label={`Delete ${cardWord} too`}
            danger
            onPress={() => {
              setDeleteAsk(false);
              board.deleteColumn(col.id);
            }}
          />
        </Menu>
      </Sheet>
    </View>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  columnId: string;
  columns: Column[];
  index: number;
  count: number;
  drag: BoardDrag;
  dragging: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onMoveToColumn: (columnId: string) => void;
  onNudge: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * One card face: square done-check, multi-line title. The whole card is a
 * drag handle on web; right-click (web) / long-press (touch) opens the context
 * menu — the touch path for everything hover-only.
 */
function TaskCard({ task, columnId, columns, index, count, drag, dragging, onOpen, onToggleDone, onMoveToColumn, onNudge, onDuplicate, onDelete }: TaskCardProps) {
  const { colors } = useTheme();
  const cardRef = useRef<ViewType>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hover = useRowHover();

  // Right-click context menu — a web-only DOM prop RNW forwards on a View
  // (the useRowHover idiom; absent from RN's types).
  const contextProps = (Platform.OS === 'web'
    ? {
        onContextMenu: (e: { preventDefault?: () => void }) => {
          e.preventDefault?.();
          setMenuOpen(true);
        },
      }
    : {}) as unknown as Partial<ViewProps>;

  return (
    <View
      ref={cardRef}
      collapsable={false}
      onLayout={(e) => drag.registerCard(columnId, task.id, { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}
      {...drag.dragProps(task.id, columnId)}
      {...contextProps}
      {...hover.hoverProps}
      style={[
        styles.card,
        { backgroundColor: hover.hovered ? colors.fillDeep : colors.fill, borderColor: colors.lineFaint },
        dragging && styles.cardDragging,
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.done ? 'Mark not done' : 'Mark done'}
        onPress={onToggleDone}
        hitSlop={8}
        style={styles.checkbox}
      >
        <Icon
          name={task.done ? 'square-check' : 'square'}
          size={layout.checkboxSize}
          color={task.done ? colors.success : colors.inkFaint}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${task.title || 'Untitled'}`}
        onPress={() => {
          if (drag.consumeClick()) return; // the drop's mouseup, not a click
          onOpen();
        }}
        onLongPress={() => {
          tapFeedback();
          setMenuOpen(true);
        }}
        style={styles.cardText}
      >
        <Txt variant="subhead" tone={task.title ? 'ink' : 'inkFaint'} numberOfLines={2} style={task.done ? styles.cardDone : undefined}>
          {task.title || 'Untitled'}
        </Txt>
      </Pressable>

      <AdaptiveMenu visible={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={cardRef} title={task.title || 'Card'}>
        <Menu>
          <MenuItem icon="expand" label="Open" onPress={() => { setMenuOpen(false); onOpen(); }} />
          {columns.length > 1 ? (
            <>
              <MenuSeparator />
              <MenuLabel>Move to</MenuLabel>
              {columns.map((c) => (
                <MenuItem
                  key={c.id}
                  label={c.title || 'Untitled'}
                  checked={c.id === columnId}
                  onPress={c.id === columnId ? undefined : () => { setMenuOpen(false); onMoveToColumn(c.id); }}
                />
              ))}
            </>
          ) : null}
          <MenuSeparator />
          <MenuItem icon="arrow-up" label="Move up" disabled={index === 0} onPress={() => { setMenuOpen(false); onNudge(-1); }} />
          <MenuItem icon="arrow-down" label="Move down" disabled={index === count - 1} onPress={() => { setMenuOpen(false); onNudge(1); }} />
          <MenuItem icon="duplicate" label="Duplicate" onPress={() => { setMenuOpen(false); onDuplicate(); }} />
          <MenuSeparator />
          <MenuItem icon="trash" label="Delete" danger onPress={() => { setMenuOpen(false); onDelete(); }} />
        </Menu>
      </AdaptiveMenu>
    </View>
  );
}

// ── Inline composer ──────────────────────────────────────────────────────────

/**
 * The "+ New" ghost card. NOTHING is written until a commit gesture lands with
 * real text: Enter commits and keeps composing (rapid entry — the field just
 * clears, no remount), blur commits a non-empty draft then closes, Escape
 * discards. No more "New task" litter from an accidental tap.
 */
function CardComposer({ onSubmit, onClose }: { onSubmit: (title: string) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const discarded = useRef(false);

  const commit = () => {
    const v = text.trim();
    if (v) {
      onSubmit(v);
      setText('');
    }
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS !== 'web') return;
    const ev = e as WebKeyEvent;
    const key = ev.nativeEvent.key;
    if (key === 'Escape') {
      ev.preventDefault?.();
      discarded.current = true;
      onClose();
    } else if (key === 'Enter' && !ev.nativeEvent.isComposing) {
      ev.preventDefault?.();
      commit();
    }
  };

  return (
    <View style={[styles.composer, { backgroundColor: colors.fill, borderColor: colors.accentBorder }]}>
      <TextField
        value={text}
        onChangeText={setText}
        autoFocus
        plain
        placeholder="New card"
        accessibilityLabel="New card title"
        onKeyPress={onKeyPress}
        // Web commits via onKeyPress ONLY — RNW also synthesizes a submit from
        // the same Enter keydown, and wiring both would add the card twice.
        {...(Platform.OS !== 'web' ? { onSubmitEditing: commit } : {})}
        // Keep focus through Enter so a run of cards is one breath of typing.
        submitBehavior="submit"
        onBlur={() => {
          if (!discarded.current) commit();
          onClose();
        }}
        containerStyle={styles.composerField}
      />
      {Platform.OS !== 'web' ? (
        // Touch needs a visible way out: tapping non-interactive chrome doesn't
        // blur a native TextInput, so without this the composer can't be left.
        <IconButton
          name="x"
          size={14}
          color={colors.inkMuted}
          accessibilityLabel="Cancel new card"
          onPress={() => {
            discarded.current = true;
            onClose();
          }}
        />
      ) : null}
    </View>
  );
}

/** The quiet foot row that summons the composer. */
function AddCardRow({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New card"
      disabled={disabled}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => [
        styles.addCard,
        { backgroundColor: pressed ? colors.pressed : hovered ? colors.hover : 'transparent' },
        disabled && { opacity: opacity.disabled },
      ]}
    >
      <Icon name="plus" size={13} color={colors.inkFaint} />
      <Txt variant="caption" tone="inkFaint">New</Txt>
    </Pressable>
  );
}

// ── Presentation helpers ─────────────────────────────────────────────────────

/** Loading state that mirrors the real strip — a board opening must never look
 *  like an empty board (trust). */
function BoardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={styles.skeletonRow}>
      {[3, 2, 3].map((cards, i) => (
        <View key={i} style={[styles.column, paperBorder(colors), shadows.sm]}>
          <View style={styles.skeletonHead}>
            <Skeleton width={96} height={10} />
          </View>
          {Array.from({ length: cards }).map((_, j) => (
            <Skeleton key={j} height={44} radius={radii.md} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** First-open empty state: one obvious path (the classic three columns) and a
 *  quiet escape hatch — not a lone dashed dev button. */
function BoardEmpty({ onSeed, onAddColumn }: { onSeed: () => void; onAddColumn: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, paperBorder(colors)]}>
      <Txt variant="heading">A blank board</Txt>
      <Txt variant="callout" tone="inkMuted">
        Columns group your cards. Start with the classic three, or shape your own.
      </Txt>
      <View style={styles.emptyActions}>
        <Button label="Start with To do · In progress · Done" variant="secondary" size="sm" onPress={onSeed} />
        <Button label="Add a column" variant="ghost" size="sm" onPress={onAddColumn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, paddingHorizontal: spacing.screenX },
  stripWrap: { position: 'relative' },
  columns: { gap: spacing.md, paddingBottom: spacing.sm, alignItems: 'flex-start' },
  column: { width: layout.boardColumnWidth, borderRadius: radii.card, borderWidth: 1, padding: spacing.sm, gap: spacing.xs },
  addColumn: { width: layout.boardColumnWidth, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.card, borderWidth: 1, borderStyle: 'dashed' },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: 2, paddingBottom: spacing.xs, minHeight: 30 },
  colTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  colTitleHit: { borderRadius: radii.sm, paddingHorizontal: spacing.xs, paddingVertical: 2, marginHorizontal: -spacing.xs },
  colActions: { flexDirection: 'row', alignItems: 'center' },
  // Web: reserve the space (no header reflow) but hide until the column is hovered.
  colActionsHidden: { opacity: 0 },
  cards: { gap: spacing.xs },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, padding: spacing.sm, borderRadius: radii.md, borderWidth: 1, minHeight: 44 },
  cardDragging: { opacity: opacity.muted },
  checkbox: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginTop: -spacing.xs, marginLeft: -spacing.xs },
  cardText: { flex: 1, gap: 2 },
  cardDone: { textDecorationLine: 'line-through', opacity: opacity.muted },
  dropLine: { height: 2, borderRadius: radii.pill, marginHorizontal: 2 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, minHeight: 44 },
  composerField: { flex: 1 },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.md,
    // Touch keeps the 44px floor; web stays Notion-dense.
    minHeight: Platform.OS === 'web' ? 28 : 44,
  },
  fade: { position: 'absolute', top: 0, bottom: spacing.sm, width: spacing.xxl },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
  skeletonRow: { flexDirection: 'row', gap: spacing.md, overflow: 'hidden' },
  skeletonHead: { paddingVertical: spacing.xs },
  empty: { borderRadius: radii.card, borderWidth: 1, padding: spacing.xl, gap: spacing.sm, alignItems: 'flex-start', maxWidth: layout.maxContentWidth },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
