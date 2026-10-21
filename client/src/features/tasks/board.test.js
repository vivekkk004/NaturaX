import { describe, it, expect } from 'vitest';
import tasksReducer, { fetchBoardColumn, moveTask } from './tasksSlice';
import { canDrag, canMove } from './transitions';

const task = (id, status) => ({ id, orderId: `ORD-${id}`, status });
const page = (tasks, total = tasks.length) => ({
  data: tasks,
  pagination: { page: 1, limit: 30, total, totalPages: 1 },
});

function boardWith(columns) {
  let state = tasksReducer(undefined, { type: 'init' });
  for (const [status, tasks] of Object.entries(columns)) {
    state = tasksReducer(state, fetchBoardColumn.pending(`r-${status}`, { status }));
    state = tasksReducer(state, fetchBoardColumn.fulfilled(page(tasks), `r-${status}`, { status }));
  }
  return state;
}

describe('Kanban board state', () => {
  it('moves a card immediately when it is dropped (optimistic update)', () => {
    const state = boardWith({
      OPEN: [task(1, 'OPEN'), task(2, 'OPEN')],
      IN_PROGRESS: [],
      RESOLVED: [],
    });
    const next = tasksReducer(
      state,
      moveTask.pending('m1', { task: task(1, 'OPEN'), to: 'IN_PROGRESS' }),
    );

    expect(next.board.OPEN.items.map((t) => t.id)).toEqual([2]);
    expect(next.board.OPEN.total).toBe(1);
    expect(next.board.IN_PROGRESS.items).toEqual([{ ...task(1, 'OPEN'), status: 'IN_PROGRESS' }]);
    expect(next.board.IN_PROGRESS.total).toBe(1);
  });

  it('puts the card back if the server refuses the move', () => {
    const state = boardWith({ OPEN: [task(1, 'OPEN')], IN_PROGRESS: [], RESOLVED: [] });
    const arg = { task: task(1, 'OPEN'), to: 'RESOLVED' };
    let next = tasksReducer(state, moveTask.pending('m1', arg));
    next = tasksReducer(next, moveTask.rejected(null, 'm1', arg, { message: 'Conflict' }));

    expect(next.board.OPEN.items).toEqual([task(1, 'OPEN')]);
    expect(next.board.RESOLVED.items).toEqual([]);
    expect([next.board.OPEN.total, next.board.RESOLVED.total]).toEqual([1, 0]);
  });

  it('replaces the moved card with the server version on success', () => {
    const state = boardWith({ OPEN: [task(1, 'OPEN')], IN_PROGRESS: [], RESOLVED: [] });
    const arg = { task: task(1, 'OPEN'), to: 'RESOLVED' };
    let next = tasksReducer(state, moveTask.pending('m1', arg));
    const fromServer = { ...task(1, 'RESOLVED'), resolutionNote: 'done' };
    next = tasksReducer(next, moveTask.fulfilled(fromServer, 'm1', arg));

    expect(next.board.RESOLVED.items).toEqual([fromServer]);
  });

  it('ignores a late response for a column that was reloaded since', () => {
    let state = tasksReducer(undefined, { type: 'init' });
    state = tasksReducer(state, fetchBoardColumn.pending('old', { status: 'OPEN' }));
    state = tasksReducer(state, fetchBoardColumn.pending('new', { status: 'OPEN' }));
    state = tasksReducer(
      state,
      fetchBoardColumn.fulfilled(page([task(2, 'OPEN')]), 'new', { status: 'OPEN' }),
    );
    state = tasksReducer(
      state,
      fetchBoardColumn.fulfilled(page([task(1, 'OPEN')]), 'old', { status: 'OPEN' }),
    );

    expect(state.board.OPEN.items.map((t) => t.id)).toEqual([2]);
  });
});

describe('who may move a card where', () => {
  it('lets employees work forward but not reopen', () => {
    expect(canMove('EMPLOYEE', 'OPEN', 'IN_PROGRESS')).toBe(true);
    expect(canMove('EMPLOYEE', 'IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(canMove('EMPLOYEE', 'RESOLVED', 'OPEN')).toBe(false);
    expect(canDrag('EMPLOYEE', 'RESOLVED')).toBe(false);
  });

  it('lets managers reopen, and never "moves" a card onto its own column', () => {
    expect(canMove('MANAGER', 'RESOLVED', 'IN_PROGRESS')).toBe(true);
    expect(canDrag('MANAGER', 'RESOLVED')).toBe(true);
    expect(canMove('MANAGER', 'OPEN', 'OPEN')).toBe(false);
  });
});
