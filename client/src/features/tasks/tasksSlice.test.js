import { describe, it, expect } from 'vitest';
import tasksReducer, {
  fetchTasks,
  setTaskFilters,
  setTaskPage,
  updateTaskStatus,
} from './tasksSlice';

const page = (ids) => ({
  data: ids.map((id) => ({ id, status: 'OPEN' })),
  pagination: { page: 1, limit: 20, total: ids.length, totalPages: 1 },
});

describe('tasksSlice', () => {
  it('resets to page 1 whenever a filter changes', () => {
    let state = tasksReducer(undefined, setTaskPage(4));
    state = tasksReducer(state, setTaskFilters({ priority: 'HIGH' }));
    expect(state.page).toBe(1);
    expect(state.filters.priority).toBe('HIGH');
    expect(state.filters.status).toBe('UNRESOLVED'); // other filters untouched
  });

  it('ignores a slow, outdated response that arrives after a newer request', () => {
    let state = tasksReducer(undefined, fetchTasks.pending('old'));
    state = tasksReducer(state, fetchTasks.pending('new'));
    state = tasksReducer(state, fetchTasks.fulfilled(page(['b']), 'new'));
    state = tasksReducer(state, fetchTasks.fulfilled(page(['a']), 'old')); // late arrival

    expect(state.items.map((t) => t.id)).toEqual(['b']);
    expect(state.status).toBe('succeeded');
  });

  it('keeps the list and the open detail in sync after a status change', () => {
    let state = tasksReducer(undefined, fetchTasks.pending('r1'));
    state = tasksReducer(state, fetchTasks.fulfilled(page(['t1', 't2']), 'r1'));

    const changed = { id: 't1', status: 'RESOLVED' };
    state = tasksReducer(
      state,
      updateTaskStatus.fulfilled({ task: changed, history: [] }, 'r2', {
        id: 't1',
        status: 'RESOLVED',
      }),
    );

    expect(state.items.find((t) => t.id === 't1').status).toBe('RESOLVED');
    expect(state.mutation.status).toBe('idle');
  });

  it('exposes the server error when a change is rejected', () => {
    const state = tasksReducer(
      undefined,
      updateTaskStatus.rejected(
        null,
        'r',
        {},
        { message: 'Only a manager can reopen a resolved task' },
      ),
    );
    expect(state.mutation).toEqual({
      status: 'failed',
      error: 'Only a manager can reopen a resolved task',
    });
  });
});
