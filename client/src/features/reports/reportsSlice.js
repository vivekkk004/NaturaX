import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { reportService } from '../../services/reportService';
import { toApiError } from '../../services/api';
import { todayIst } from '../../utils/format';

export const fetchDailyReport = createAsyncThunk(
  'reports/fetchDaily',
  async (_, { getState, rejectWithValue }) => {
    try {
      return await reportService.daily(getState().reports.date);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

export const downloadReportCsv = createAsyncThunk(
  'reports/downloadCsv',
  async (section, { getState, rejectWithValue }) => {
    try {
      return await reportService.downloadCsv(getState().reports.date, section);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

const reportsSlice = createSlice({
  name: 'reports',
  initialState: {
    date: todayIst(),
    data: null,
    status: 'idle',
    error: null,
    download: { section: null, status: 'idle', error: null },
  },
  reducers: {
    setReportDate(state, { payload }) {
      state.date = payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDailyReport.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchDailyReport.fulfilled, (state, { payload }) => {
        state.data = payload;
        state.status = 'succeeded';
      })
      .addCase(fetchDailyReport.rejected, (state, { payload }) => {
        state.status = 'failed';
        state.error = payload?.message ?? 'Could not load the report';
      })
      .addCase(downloadReportCsv.pending, (state, { meta }) => {
        state.download = { section: meta.arg, status: 'loading', error: null };
      })
      .addCase(downloadReportCsv.fulfilled, (state) => {
        state.download = { section: null, status: 'succeeded', error: null };
      })
      .addCase(downloadReportCsv.rejected, (state, { payload }) => {
        state.download = {
          section: null,
          status: 'failed',
          error: payload?.message ?? 'Download failed',
        };
      });
  },
});

export const { setReportDate } = reportsSlice.actions;
export default reportsSlice.reducer;

export const selectReports = (state) => state.reports;
