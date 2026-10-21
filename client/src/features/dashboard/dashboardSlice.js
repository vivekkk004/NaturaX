import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { dashboardService } from '../../services/dashboardService';
import { toApiError } from '../../services/api';

export const DEFAULT_DASHBOARD_FILTERS = {
  dateFrom: '',
  dateTo: '',
  ruleType: '',
  assignedTo: '',
  priority: '',
};

export const fetchDashboard = createAsyncThunk(
  'dashboard/fetch',
  async (_, { getState, rejectWithValue }) => {
    try {
      return await dashboardService.get(getState().dashboard.filters);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

/**
 * Live counts for the sidebar badges (open / overdue tasks). Unfiltered, so they always show the
 * whole picture; the API already limits employees to their own tasks.
 */
export const fetchNavCounts = createAsyncThunk(
  'dashboard/fetchNavCounts',
  async (_, { rejectWithValue }) => {
    try {
      const { totals } = await dashboardService.get({});
      return { unresolvedTasks: totals.unresolvedTasks, overdueTasks: totals.overdueTasks };
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState: {
    filters: DEFAULT_DASHBOARD_FILTERS,
    data: null,
    status: 'idle',
    error: null,
    currentRequestId: null,
    navCounts: null, // { unresolvedTasks, overdueTasks } - null until first loaded
  },
  reducers: {
    setDashboardFilters(state, { payload }) {
      state.filters = { ...state.filters, ...payload };
    },
    resetDashboardFilters(state) {
      state.filters = DEFAULT_DASHBOARD_FILTERS;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state, { meta }) => {
        state.status = 'loading';
        state.error = null;
        state.currentRequestId = meta.requestId;
      })
      .addCase(fetchDashboard.fulfilled, (state, { payload, meta }) => {
        if (meta.requestId !== state.currentRequestId) return;
        state.data = payload;
        state.status = 'succeeded';
      })
      .addCase(fetchDashboard.rejected, (state, { payload, meta }) => {
        if (meta.requestId !== state.currentRequestId) return;
        state.status = 'failed';
        state.error = payload?.message ?? 'Could not load the dashboard';
      })
      .addCase(fetchNavCounts.fulfilled, (state, { payload }) => {
        state.navCounts = payload;
      });
    // A failed badge refresh keeps the last known counts - the sidebar never shows an error.
  },
});

export const { setDashboardFilters, resetDashboardFilters } = dashboardSlice.actions;
export default dashboardSlice.reducer;

export const selectDashboard = (state) => state.dashboard;
export const selectDashboardFilters = (state) => state.dashboard.filters;
export const selectNavCounts = (state) => state.dashboard.navCounts;
