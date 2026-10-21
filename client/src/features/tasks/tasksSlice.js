import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import { taskService } from '../../services/taskService';
import { toApiError } from '../../services/api';
import { BOARD_STATUSES } from './transitions';

export const DEFAULT_TASK_FILTERS = {
  status: 'UNRESOLVED',
  ruleType: '',
  priority: '',
  assignedTo: '',
  overdue: false,
  search: '',
  dateFrom: '',
  dateTo: '',
};

/** Reads filters/sort/page from the store, so callers just dispatch fetchTasks(). */
export const fetchTasks = createAsyncThunk(
  'tasks/fetchList',
  async (_, { getState, rejectWithValue }) => {
    const { filters, sort, page, limit } = getState().tasks;
    try {
      return await taskService.list({ ...filters, sort, page, limit });
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

export const fetchTaskDetail = createAsyncThunk(
  'tasks/fetchDetail',
  async (id, { rejectWithValue }) => {
    try {
      const [task, history] = await Promise.all([taskService.get(id), taskService.history(id)]);
      return { task, history };
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

/** After a change, reload the history so the new audit entry shows immediately. */
export const updateTaskStatus = createAsyncThunk(
  'tasks/updateStatus',
  async ({ id, status, note }, { rejectWithValue }) => {
    try {
      const task = await taskService.updateStatus(id, { status, note: note || undefined });
      return { task, history: await taskService.history(id) };
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

export const assignTask = createAsyncThunk(
  'tasks/assign',
  async ({ id, assignedTo, deadline, note }, { rejectWithValue }) => {
    try {
      const task = await taskService.assign(id, { assignedTo, deadline, note });
      return { task, history: await taskService.history(id) };
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

// ---------- Kanban board ----------

const BOARD_PAGE_SIZE = 30;
const VIEW_STORAGE_KEY = 'naturax:tasks-view';

/** Per-viewer convenience: remember List vs Board. Storage can be unavailable (private mode). */
function readSavedView() {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

export function saveTaskView(view) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // not persisted - fine, it's only a convenience
  }
}

/**
 * One column of the board = one status, loaded with the same filters as the list (except status).
 * Open/In progress are ordered by deadline (most urgent first), Resolved by most recently changed.
 */
export const fetchBoardColumn = createAsyncThunk(
  'tasks/fetchBoardColumn',
  async ({ status, page = 1 }, { getState, rejectWithValue }) => {
    const { status: _listStatus, ...filters } = getState().tasks.filters;
    try {
      return await taskService.list({
        ...filters,
        status,
        page,
        limit: BOARD_PAGE_SIZE,
        sort: status === 'RESOLVED' ? '-updatedAt' : 'deadline',
      });
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

/** Loads all three columns in parallel. */
export const fetchBoard = () => (dispatch) =>
  Promise.all(BOARD_STATUSES.map((status) => dispatch(fetchBoardColumn({ status }))));

/**
 * Drag-and-drop status change. The card is moved immediately (optimistic update in `pending`);
 * if the server refuses, `rejected` puts it back where it was.
 */
export const moveTask = createAsyncThunk(
  'tasks/move',
  async ({ task, to, note }, { rejectWithValue }) => {
    try {
      return await taskService.updateStatus(task.id, { status: to, note: note || undefined });
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

const emptyColumn = { items: [], total: 0, page: 0, status: 'idle', error: null, requestId: null };

function moveCard(board, task, from, to) {
  board[from].items = board[from].items.filter((t) => t.id !== task.id);
  board[from].total = Math.max(0, board[from].total - 1);
  board[to].items = [task, ...board[to].items.filter((t) => t.id !== task.id)];
  board[to].total += 1;
}

const initialState = {
  view: readSavedView(), // 'list' | 'board'
  board: Object.fromEntries(BOARD_STATUSES.map((s) => [s, emptyColumn])),
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  filters: DEFAULT_TASK_FILTERS,
  sort: 'deadline',
  page: 1,
  limit: 20,
  status: 'idle', // idle | loading | succeeded | failed
  error: null,
  currentRequestId: null,
  detail: { task: null, history: [], status: 'idle', error: null },
  mutation: { status: 'idle', error: null },
};

function applyTaskChange(state, { task, history }) {
  state.items = state.items.map((t) => (t.id === task.id ? task : t));
  if (state.detail.task?.id === task.id) {
    state.detail.task = task;
    state.detail.history = history;
  }
  state.mutation = { status: 'idle', error: null };
}

const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    /** Any filter change starts again at page 1. */
    setTaskFilters(state, { payload }) {
      state.filters = { ...state.filters, ...payload };
      state.page = 1;
    },
    resetTaskFilters(state) {
      state.filters = DEFAULT_TASK_FILTERS;
      state.page = 1;
    },
    setTaskSort(state, { payload }) {
      state.sort = payload;
      state.page = 1;
    },
    setTaskPage(state, { payload }) {
      state.page = payload;
    },
    setTaskLimit(state, { payload }) {
      state.limit = payload;
      state.page = 1;
    },
    closeTaskDetail(state) {
      state.detail = initialState.detail;
      state.mutation = initialState.mutation;
    },
    setTaskView(state, { payload }) {
      state.view = payload; // persisted by saveTaskView() in the click handler - reducers stay pure
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBoardColumn.pending, (state, { meta }) => {
        const column = state.board[meta.arg.status];
        column.status = 'loading';
        column.error = null;
        column.requestId = meta.requestId;
      })
      .addCase(fetchBoardColumn.fulfilled, (state, { payload, meta }) => {
        const column = state.board[meta.arg.status];
        if (meta.requestId !== column.requestId) return; // a newer load for this column exists
        const page = payload.pagination.page;
        const known = new Set(page === 1 ? [] : column.items.map((t) => t.id));
        column.items =
          page === 1
            ? payload.data
            : [...column.items, ...payload.data.filter((t) => !known.has(t.id))];
        column.total = payload.pagination.total;
        column.page = page;
        column.status = 'succeeded';
      })
      .addCase(fetchBoardColumn.rejected, (state, { payload, meta }) => {
        const column = state.board[meta.arg.status];
        if (meta.requestId !== column.requestId) return;
        column.status = 'failed';
        column.error = payload?.message ?? 'Could not load tasks';
      })
      .addCase(moveTask.pending, (state, { meta }) => {
        const { task, to } = meta.arg;
        moveCard(state.board, { ...task, status: to }, task.status, to);
      })
      .addCase(moveTask.fulfilled, (state, { payload, meta }) => {
        const column = state.board[meta.arg.to];
        column.items = column.items.map((t) => (t.id === payload.id ? payload : t));
        state.items = state.items.map((t) => (t.id === payload.id ? payload : t));
      })
      .addCase(moveTask.rejected, (state, { meta }) => {
        const { task, to } = meta.arg;
        moveCard(state.board, task, to, task.status); // put it back
      })
      .addCase(fetchTasks.pending, (state, { meta }) => {
        state.status = 'loading';
        state.error = null;
        state.currentRequestId = meta.requestId;
      })
      .addCase(fetchTasks.fulfilled, (state, { payload, meta }) => {
        // Ignore a slow, outdated response that arrives after a newer request was sent.
        if (meta.requestId !== state.currentRequestId) return;
        state.items = payload.data;
        state.pagination = payload.pagination;
        state.status = 'succeeded';
      })
      .addCase(fetchTasks.rejected, (state, { payload, meta }) => {
        if (meta.requestId !== state.currentRequestId) return;
        state.status = 'failed';
        state.error = payload?.message ?? 'Could not load tasks';
      })
      .addCase(fetchTaskDetail.pending, (state) => {
        state.detail.status = 'loading';
        state.detail.error = null;
      })
      .addCase(fetchTaskDetail.fulfilled, (state, { payload }) => {
        state.detail = { ...payload, status: 'succeeded', error: null };
      })
      .addCase(fetchTaskDetail.rejected, (state, { payload }) => {
        state.detail.status = 'failed';
        state.detail.error = payload?.message ?? 'Could not load the task';
      })
      .addCase(updateTaskStatus.fulfilled, (state, { payload }) => applyTaskChange(state, payload))
      .addCase(assignTask.fulfilled, (state, { payload }) => applyTaskChange(state, payload))
      .addMatcher(
        (action) => [updateTaskStatus.pending.type, assignTask.pending.type].includes(action.type),
        (state) => {
          state.mutation = { status: 'loading', error: null };
        },
      )
      .addMatcher(
        (action) =>
          [updateTaskStatus.rejected.type, assignTask.rejected.type].includes(action.type),
        (state, { payload }) => {
          state.mutation = {
            status: 'failed',
            error: payload?.message ?? 'The change was not saved',
          };
        },
      );
  },
});

export const {
  setTaskFilters,
  resetTaskFilters,
  setTaskSort,
  setTaskPage,
  setTaskLimit,
  closeTaskDetail,
  setTaskView,
} = tasksSlice.actions;
export default tasksSlice.reducer;

export const selectTasksState = (state) => state.tasks;
export const selectTaskDetail = (state) => state.tasks.detail;
export const selectTaskMutation = (state) => state.tasks.mutation;
export const selectTaskView = (state) => state.tasks.view;
export const selectBoard = (state) => state.tasks.board;
export const selectTaskFilters = (state) => state.tasks.filters;
/** Memoised: a new object only when something that affects the request changes (drives useEffect). */
export const selectTaskQuery = createSelector(
  [(s) => s.tasks.filters, (s) => s.tasks.sort, (s) => s.tasks.page, (s) => s.tasks.limit],
  (filters, sort, page, limit) => ({ filters, sort, page, limit }),
);
