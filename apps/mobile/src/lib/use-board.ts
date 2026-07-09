import { useMemo } from 'react';

import { useObjectContent, useWalMutator } from './use-object-content';
import { useSpaceObjects } from './space-objects-context';
import * as boardContent from '@drakkar.software/octovault-sdk';
import * as taskModel from '@drakkar.software/octovault-sdk';
import type { ErrorKind } from '@drakkar.software/octovault-sdk';

export type { Column } from '@drakkar.software/octovault-sdk';
export type { Task, TaskStatus } from '@drakkar.software/octovault-sdk';
export { orderBetween } from '@drakkar.software/octovault-sdk';

export interface Board {
  columns: boardContent.Column[];
  tasksByColumn: Record<string, taskModel.Task[]>;
  done: number;
  total: number;
}

const EMPTY_BOARD: Board = { columns: [], tasksByColumn: {}, done: 0, total: 0 };

export interface BoardHook {
  board: Board;
  ready: boolean;
  opening: boolean;
  openError: string | null;
  /** Why {@link openError} happened — drives which recovery UI is offered. */
  openErrorKind: ErrorKind | null;
  offline: boolean;
  reload: () => void;
  /** Returns the new column id (or undefined before the doc is open). */
  addColumn: (title: string) => string | undefined;
  renameColumn: (id: string, title: string) => void;
  /** Reorder a column to `toIndex` within the strip. */
  moveColumn: (id: string, toIndex: number) => void;
  /** Flag/unflag a column as the board's "Done" group (cards in it count done). */
  setColumnDone: (id: string, done: boolean) => void;
  /** Delete a column; its task-objects re-home to `moveTasksTo` or are archived. */
  deleteColumn: (id: string, opts?: { moveTasksTo?: string | null }) => void;
  /** Seed the canonical To do / In progress / Done starter columns. */
  seedColumns: () => void;
  /** Returns the new task id (or undefined before the store is ready). `order`
   *  defaults to appending after the column's last card. */
  addTask: (columnId: string, title: string, order?: number) => string | undefined;
  /** Copy a card into `order` within its column; returns the new id. */
  duplicateTask: (source: taskModel.Task, order: number) => string | undefined;
  moveTask: (id: string, columnId: string, order: number) => void;
  changeStatus: (id: string, status: taskModel.TaskStatus) => void;
  updateTask: (id: string, patch: { title?: string; notes?: string }) => void;
  deleteTask: (id: string) => void;
  /** Un-archive a task by id (drives the toast's "Undo"). */
  restoreTask: (task: taskModel.Task) => void;
}

/**
 * One `board` Object's kanban view, backed by:
 * - a {@link WalDocument} storing the column list (via {@link useObjectContent})
 * - child task {@link ObjectNode}s (via {@link useSpaceObjects})
 *
 * Column ops write to the WAL. Task ops write through the object index.
 */
export function useBoard(spaceId: string, boardId: string, opts: { enabled?: boolean } = {}): BoardHook {
  const { walDoc: doc, ready, version, touch, opening, openError, openErrorKind, offline, reload } = useObjectContent(
    spaceId,
    boardId,
    'append',
    opts,
  );
  const { objects } = useSpaceObjects();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => (doc ? boardContent.readColumns(doc) : []), [doc, version]);

  const { tasksByColumn, done, total } = useMemo(
    () => taskModel.tasksForBoard(objects.nodes, boardId, columns),
    [objects.nodes, boardId, columns],
  );

  const board = useMemo<Board>(
    () => (columns.length > 0 || done > 0 ? { columns, tasksByColumn, done, total } : EMPTY_BOARD),
    [columns, tasksByColumn, done, total],
  );

  const walMut = useWalMutator(doc, touch);

  return {
    board,
    ready,
    opening,
    openError,
    openErrorKind,
    offline,
    reload,

    // ── Column ops (WAL doc) ──────────────────────────────────────────────────
    addColumn: (title) => walMut((d) => boardContent.addColumn(d, title)),
    renameColumn: (id, title) => walMut((d) => boardContent.renameColumn(d, id, title)),
    moveColumn: (id, toIndex) => walMut((d) => boardContent.moveColumn(d, id, toIndex)),
    setColumnDone: (id, done) => walMut((d) => boardContent.setColumnDone(d, id, done)),
    deleteColumn: (id, opts) => {
      const tasks = tasksByColumn[id] ?? [];
      if (opts?.moveTasksTo && opts.moveTasksTo !== id) {
        const target = opts.moveTasksTo;
        const last = (tasksByColumn[target] ?? []).at(-1);
        let order = (last?.order ?? 0) + 1;
        for (const t of tasks) { objects.setProps(t.id, { columnId: target, order }); order += 1; }
      } else {
        for (const t of tasks) objects.archive(t.id);
      }
      walMut((d) => boardContent.deleteColumn(d, id));
    },
    seedColumns: () => walMut((d) => boardContent.seedDefaultColumns(d)),

    // ── Task ops (object index) ───────────────────────────────────────────────
    addTask: (columnId, title, order) => {
      if (!objects.ready) return undefined;
      const siblings = tasksByColumn[columnId] ?? [];
      const resolved = order ?? (siblings.at(-1)?.order ?? 0) + 1;
      return objects.create({ type: 'task', title, parentId: boardId, meta: { props: { columnId, order: resolved, status: 'todo' } } }) ?? undefined;
    },
    duplicateTask: (source, order) => {
      if (!objects.ready) return undefined;
      return objects.create({
        type: 'task', title: source.title, parentId: boardId,
        meta: { props: { columnId: source.columnId, order, status: source.status } },
      }) ?? undefined;
    },
    moveTask: (id, columnId, order) => objects.setProps(id, { columnId, order }),
    changeStatus: (id, status) => objects.setProps(id, { status }),
    updateTask: (id, patch) => {
      if (patch.title !== undefined) objects.rename(id, { title: patch.title });
      // notes: live in the task's WAL content doc (loaded when the task is opened as a page)
    },
    deleteTask: (id) => objects.archive(id),
    restoreTask: (task) => {
      objects.restore(task.id);
      objects.setProps(task.id, { columnId: task.columnId, order: task.order, status: task.status });
    },
  };
}
