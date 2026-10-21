import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { importService } from '../../services/importService';
import { toApiError } from '../../services/api';

export const uploadOrders = createAsyncThunk(
  'imports/upload',
  async ({ file, asOf }, { rejectWithValue }) => {
    try {
      return await importService.upload(file, { asOf });
    } catch (error) {
      // Keep code + details: a format error lists the missing columns, shown to the user.
      return rejectWithValue(toApiError(error));
    }
  },
);

export const fetchImports = createAsyncThunk(
  'imports/fetchList',
  async (_, { getState, rejectWithValue }) => {
    const { page, limit } = getState().imports.history;
    try {
      return await importService.list({ page, limit, sort: '-createdAt' });
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

export const fetchImportReport = createAsyncThunk(
  'imports/fetchReport',
  async (id, { rejectWithValue }) => {
    try {
      return await importService.get(id);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

const initialState = {
  upload: { status: 'idle', error: null }, // error = { message, code, details }
  report: { data: null, status: 'idle', error: null },
  history: {
    items: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    page: 1,
    limit: 10,
    status: 'idle',
    error: null,
  },
};

const importsSlice = createSlice({
  name: 'imports',
  initialState,
  reducers: {
    setImportPage(state, { payload }) {
      state.history.page = payload;
    },
    clearImportReport(state) {
      state.report = initialState.report;
      state.upload = initialState.upload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(uploadOrders.pending, (state) => {
        state.upload = { status: 'loading', error: null };
      })
      .addCase(uploadOrders.fulfilled, (state, { payload }) => {
        state.upload = { status: 'succeeded', error: null };
        state.report = { data: payload, status: 'succeeded', error: null };
      })
      .addCase(uploadOrders.rejected, (state, { payload }) => {
        state.upload = { status: 'failed', error: payload ?? { message: 'Upload failed' } };
        state.report = initialState.report;
      })
      .addCase(fetchImports.pending, (state) => {
        state.history.status = 'loading';
        state.history.error = null;
      })
      .addCase(fetchImports.fulfilled, (state, { payload }) => {
        state.history.items = payload.data;
        state.history.pagination = payload.pagination;
        state.history.status = 'succeeded';
      })
      .addCase(fetchImports.rejected, (state, { payload }) => {
        state.history.status = 'failed';
        state.history.error = payload?.message ?? 'Could not load import history';
      })
      .addCase(fetchImportReport.pending, (state) => {
        state.report = { data: null, status: 'loading', error: null };
        state.upload = initialState.upload;
      })
      .addCase(fetchImportReport.fulfilled, (state, { payload }) => {
        state.report = { data: payload, status: 'succeeded', error: null };
      })
      .addCase(fetchImportReport.rejected, (state, { payload }) => {
        state.report = {
          data: null,
          status: 'failed',
          error: payload?.message ?? 'Could not load the report',
        };
      });
  },
});

export const { setImportPage, clearImportReport } = importsSlice.actions;
export default importsSlice.reducer;

export const selectImportUpload = (state) => state.imports.upload;
export const selectImportReport = (state) => state.imports.report;
export const selectImportHistory = (state) => state.imports.history;
