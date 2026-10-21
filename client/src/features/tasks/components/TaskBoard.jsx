import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Ban, Lock } from 'lucide-react';
import Loader from '../../../components/common/Loader';
import Modal from '../../../components/common/Modal';
import { ErrorState } from '../../../components/common/States';
import { selectCurrentUser, selectIsManager } from '../../auth/authSlice';
import { fetchNavCounts } from '../../dashboard/dashboardSlice';
import { fetchBoardColumn, fetchTaskDetail, moveTask, selectBoard } from '../tasksSlice';
import { BOARD_COLUMNS, canDrag, canMove } from '../transitions';
import { COLUMN_SCROLL_HEIGHT } from '../boardLayout';
import TaskCard from './TaskCard';

const COLUMN_DOT = { OPEN: 'bg-blue-500', IN_PROGRESS: 'bg-amber-500', RESOLVED: 'bg-green-600' };
const titleOf = (status) => BOARD_COLUMNS.find((c) => c.status === status)?.title ?? status;

/** Prefer the column under the pointer; fall back to overlap (keyboard dragging has no pointer). */
const collisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

function DraggableCard({ task, role, showAssignee, onOpen }) {
  const disabled = !canDrag(role, task.status);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // A short click opens the task; dragging needs a few pixels of movement (or a long press on touch).
      onClick={() => onOpen(task.id)}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event);
        if (event.key === 'Enter') onOpen(task.id);
      }}
      aria-roledescription={disabled ? 'task' : 'draggable task'}
      aria-label={`${task.orderId}, ${titleOf(task.status)}`}
      className={`relative shrink-0 list-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        disabled ? 'cursor-pointer' : 'cursor-grab touch-manipulation active:cursor-grabbing'
      } ${isDragging ? 'opacity-30' : ''}`}
    >
      <TaskCard task={task} showAssignee={showAssignee} />
      {disabled && (
        <Lock
          className="absolute right-2 bottom-2 h-3.5 w-3.5 text-slate-300"
          aria-label="Only a manager can reopen"
        />
      )}
    </li>
  );
}

function BoardColumn({ column, data, role, activeTask, showAssignee, onOpen, onLoadMore }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const dragging = Boolean(activeTask);
  const isSource = activeTask?.status === column.status;
  const allowed = dragging && canMove(role, activeTask.status, column.status);
  const blocked = dragging && !isSource && !allowed;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.title} column`}
      className={`flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-2xl border-2 p-3 transition-all sm:w-auto sm:max-w-none sm:flex-1 ${
        isOver && allowed
          ? 'border-brand-500 bg-brand-50'
          : allowed
            ? 'border-dashed border-brand-300 bg-slate-100/80'
            : 'border-transparent bg-slate-100/80'
      } ${blocked ? 'opacity-50' : ''}`}
    >
      <header className="mb-3 flex items-center gap-2 px-1">
        <span className={`h-2.5 w-2.5 rounded-full ${COLUMN_DOT[column.status]}`} aria-hidden />
        <h2 className="text-sm font-semibold text-slate-800">{column.title}</h2>
        <span className="rounded-full bg-white px-2 text-xs font-semibold text-slate-600 shadow-sm">
          {data.total}
        </span>
        {blocked && (
          <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
            <Ban className="h-3.5 w-3.5" aria-hidden /> Not allowed
          </span>
        )}
      </header>

      {data.status === 'failed' ? (
        <ErrorState message={data.error} />
      ) : data.status !== 'succeeded' && data.items.length === 0 ? (
        <div className="py-8">
          <Loader size="sm" />
        </div>
      ) : (
        // Scroll area sized for exactly 3 cards (see boardLayout.js); the rest scrolls inside the
        // column. dnd-kit auto-scrolls it while a card is dragged near its edge.
        <ul
          className="-mr-1.5 flex min-h-24 flex-col gap-2.5 overflow-y-auto overscroll-contain pr-1.5 [scrollbar-width:thin]"
          style={{ maxHeight: COLUMN_SCROLL_HEIGHT }}
          onScroll={(event) => {
            // Load the next page automatically when the user scrolls near the end of the column.
            const list = event.currentTarget;
            const nearEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 200;
            if (nearEnd && data.items.length < data.total && data.status !== 'loading')
              onLoadMore();
          }}
        >
          {data.items.map((task) => (
            <DraggableCard
              key={task.id}
              task={task}
              role={role}
              showAssignee={showAssignee}
              onOpen={onOpen}
            />
          ))}
          {data.items.length === 0 && (
            <li className="flex h-24 list-none items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-400">
              {allowed ? 'Drop here' : 'No tasks'}
            </li>
          )}
        </ul>
      )}

      {data.items.length < data.total && (
        <button
          type="button"
          className="btn-ghost mt-3 w-full text-xs"
          disabled={data.status === 'loading'}
          onClick={onLoadMore}
        >
          {data.status === 'loading'
            ? 'Loading…'
            : `Show more (${data.total - data.items.length} left)`}
        </button>
      )}
    </section>
  );
}

/** Asked when a card is dropped on "Resolved": the note goes into the audit trail. */
function ResolveDialog({ task, onConfirm, onCancel }) {
  const [note, setNote] = useState('');
  return (
    <Modal
      open={Boolean(task)}
      onClose={onCancel}
      size="sm"
      title={`Resolve ${task?.orderId ?? ''}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => onConfirm(note)}>
            Mark resolved
          </button>
        </>
      }
    >
      <label htmlFor="board-resolution-note" className="label">
        What was done?{' '}
        <span className="font-normal text-slate-400">(optional, saved in the audit trail)</span>
      </label>
      <textarea
        id="board-resolution-note"
        rows={3}
        maxLength={1000}
        className="input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Customer confirmed the address, re-attempt booked"
      />
    </Modal>
  );
}

/**
 * Kanban view of the tasks: drag a card to another column to change its status.
 * Works with mouse, touch (press and hold) and keyboard (Space to pick up, arrows, Space to drop).
 */
export default function TaskBoard({ onChanged }) {
  const dispatch = useDispatch();
  const board = useSelector(selectBoard);
  const user = useSelector(selectCurrentUser);
  const isManager = useSelector(selectIsManager);
  const [activeTask, setActiveTask] = useState(null);
  const [resolving, setResolving] = useState(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const move = async (task, to, note) => {
    const result = await dispatch(moveTask({ task, to, note }));
    if (moveTask.fulfilled.match(result)) {
      toast.success(`${task.orderId} moved to ${titleOf(to)}`);
      dispatch(fetchNavCounts());
      onChanged?.();
    } else {
      toast.error(result.payload?.message ?? 'The task could not be moved');
    }
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveTask(null);
    if (!over) return;
    const task = active.data.current.task;
    const to = over.id;
    if (task.status === to) return;
    if (!canMove(user.role, task.status, to)) {
      toast.error(
        task.status === 'RESOLVED'
          ? 'Only a manager can reopen a resolved task'
          : 'That move is not allowed',
      );
      return;
    }
    if (to === 'RESOLVED') setResolving(task);
    else move(task, to);
  };

  const announcements = {
    onDragStart: ({ active }) => `Picked up ${active.data.current.task.orderId}.`,
    onDragOver: ({ over }) => (over ? `Over ${titleOf(over.id)}.` : 'Not over a column.'),
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${active.data.current.task.orderId} on ${titleOf(over.id)}.`
        : 'Dropped outside the board.',
    onDragCancel: () => 'Moving cancelled.',
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={({ active }) => setActiveTask(active.data.current.task)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveTask(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Press Space to pick up the task, use the arrow keys to move it to another column, and Space again to drop it. Press Enter to open it.',
          },
        }}
      >
        <div
          className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0"
          role="group"
          aria-label="Task board"
        >
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn
              key={column.status}
              column={column}
              data={board[column.status]}
              role={user.role}
              activeTask={activeTask}
              showAssignee={isManager}
              onOpen={(id) => dispatch(fetchTaskDetail(id))}
              onLoadMore={() =>
                dispatch(
                  fetchBoardColumn({ status: column.status, page: board[column.status].page + 1 }),
                )
              }
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask && <TaskCard task={activeTask} showAssignee={isManager} overlay />}
        </DragOverlay>
      </DndContext>

      <ResolveDialog
        key={resolving?.id ?? 'none'}
        task={resolving}
        onCancel={() => setResolving(null)}
        onConfirm={(note) => {
          const task = resolving;
          setResolving(null);
          move(task, 'RESOLVED', note);
        }}
      />
    </>
  );
}
