import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import { taskService } from '../../services/taskService';
import { toApiError } from '../../services/api';

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

const initialState = {
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
  },
  extraReducers: (builder) => {
    builder
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
} = tasksSlice.actions;
export default tasksSlice.reducer;

export const selectTasksState = (state) => state.tasks;
export const selectTaskDetail = (state) => state.tasks.detail;
export const selectTaskMutation = (state) => state.tasks.mutation;
/** Memoised: a new object only when something that affects the request changes (drives useEffect). */
export const selectTaskQuery = createSelector(
  [(s) => s.tasks.filters, (s) => s.tasks.sort, (s) => s.tasks.page, (s) => s.tasks.limit],
  (filters, sort, page, limit) => ({ filters, sort, page, limit }),
);
