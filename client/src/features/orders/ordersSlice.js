import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import { orderService } from '../../services/orderService';
import { toApiError } from '../../services/api';

export const DEFAULT_ORDER_FILTERS = {
  dataStatus: '',
  status: '',
  paymentType: '',
  assignedTo: '',
  search: '',
  dateFrom: '',
  dateTo: '',
};

export const fetchOrders = createAsyncThunk(
  'orders/fetchList',
  async (_, { getState, rejectWithValue }) => {
    const { filters, sort, page, limit } = getState().orders;
    try {
      return await orderService.list({ ...filters, sort, page, limit });
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

export const fetchOrderDetail = createAsyncThunk(
  'orders/fetchDetail',
  async (id, { rejectWithValue }) => {
    try {
      return await orderService.get(id);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

const initialState = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  filters: DEFAULT_ORDER_FILTERS,
  sort: '-orderDate',
  page: 1,
  limit: 20,
  status: 'idle',
  error: null,
  currentRequestId: null,
  detail: { order: null, status: 'idle', error: null },
};

const ordersSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    setOrderFilters(state, { payload }) {
      state.filters = { ...state.filters, ...payload };
      state.page = 1;
    },
    resetOrderFilters(state) {
      state.filters = DEFAULT_ORDER_FILTERS;
      state.page = 1;
    },
    setOrderSort(state, { payload }) {
      state.sort = payload;
      state.page = 1;
    },
    setOrderPage(state, { payload }) {
      state.page = payload;
    },
    setOrderLimit(state, { payload }) {
      state.limit = payload;
      state.page = 1;
    },
    closeOrderDetail(state) {
      state.detail = initialState.detail;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrders.pending, (state, { meta }) => {
        state.status = 'loading';
        state.error = null;
        state.currentRequestId = meta.requestId;
      })
      .addCase(fetchOrders.fulfilled, (state, { payload, meta }) => {
        if (meta.requestId !== state.currentRequestId) return;
        state.items = payload.data;
        state.pagination = payload.pagination;
        state.status = 'succeeded';
      })
      .addCase(fetchOrders.rejected, (state, { payload, meta }) => {
        if (meta.requestId !== state.currentRequestId) return;
        state.status = 'failed';
        state.error = payload?.message ?? 'Could not load orders';
      })
      .addCase(fetchOrderDetail.pending, (state) => {
        state.detail = { order: null, status: 'loading', error: null };
      })
      .addCase(fetchOrderDetail.fulfilled, (state, { payload }) => {
        state.detail = { order: payload, status: 'succeeded', error: null };
      })
      .addCase(fetchOrderDetail.rejected, (state, { payload }) => {
        state.detail = {
          order: null,
          status: 'failed',
          error: payload?.message ?? 'Could not load the order',
        };
      });
  },
});

export const {
  setOrderFilters,
  resetOrderFilters,
  setOrderSort,
  setOrderPage,
  setOrderLimit,
  closeOrderDetail,
} = ordersSlice.actions;
export default ordersSlice.reducer;

export const selectOrdersState = (state) => state.orders;
export const selectOrderDetail = (state) => state.orders.detail;
export const selectOrderQuery = createSelector(
  [(s) => s.orders.filters, (s) => s.orders.sort, (s) => s.orders.page, (s) => s.orders.limit],
  (filters, sort, page, limit) => ({ filters, sort, page, limit }),
);
