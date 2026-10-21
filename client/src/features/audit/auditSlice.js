import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import { auditService } from '../../services/auditService';
import { toApiError } from '../../services/api';

export const DEFAULT_AUDIT_FILTERS = { action: '', orderId: '', dateFrom: '', dateTo: '' };

export const fetchAuditLog = createAsyncThunk(
  'audit/fetchList',
  async (_, { getState, rejectWithValue }) => {
    const { filters, page, limit } = getState().audit;
    try {
      return await auditService.list({ ...filters, page, limit, sort: '-createdAt' });
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

const auditSlice = createSlice({
  name: 'audit',
  initialState: {
    items: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    filters: DEFAULT_AUDIT_FILTERS,
    page: 1,
    limit: 20,
    status: 'idle',
    error: null,
    currentRequestId: null,
  },
  reducers: {
    setAuditFilters(state, { payload }) {
      state.filters = { ...state.filters, ...payload };
      state.page = 1;
    },
    resetAuditFilters(state) {
      state.filters = DEFAULT_AUDIT_FILTERS;
      state.page = 1;
    },
    setAuditPage(state, { payload }) {
      state.page = payload;
    },
    setAuditLimit(state, { payload }) {
      state.limit = payload;
      state.page = 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuditLog.pending, (state, { meta }) => {
        state.status = 'loading';
        state.error = null;
        state.currentRequestId = meta.requestId;
      })
      .addCase(fetchAuditLog.fulfilled, (state, { payload, meta }) => {
        if (meta.requestId !== state.currentRequestId) return;
        state.items = payload.data;
        state.pagination = payload.pagination;
        state.status = 'succeeded';
      })
      .addCase(fetchAuditLog.rejected, (state, { payload, meta }) => {
        if (meta.requestId !== state.currentRequestId) return;
        state.status = 'failed';
        state.error = payload?.message ?? 'Could not load the audit trail';
      });
  },
});

export const { setAuditFilters, resetAuditFilters, setAuditPage, setAuditLimit } =
  auditSlice.actions;
export default auditSlice.reducer;

export const selectAuditState = (state) => state.audit;
export const selectAuditQuery = createSelector(
  [(s) => s.audit.filters, (s) => s.audit.page, (s) => s.audit.limit],
  (filters, page, limit) => ({ filters, page, limit }),
);
