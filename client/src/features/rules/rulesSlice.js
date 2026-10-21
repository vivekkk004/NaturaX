import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { ruleService } from '../../services/ruleService';
import { toApiError } from '../../services/api';

export const fetchRules = createAsyncThunk('rules/fetchList', async (_, { rejectWithValue }) => {
  try {
    return await ruleService.list();
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const updateRule = createAsyncThunk(
  'rules/update',
  async ({ ruleType, changes }, { rejectWithValue }) => {
    try {
      return await ruleService.update(ruleType, changes);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

export const runRulesNow = createAsyncThunk('rules/evaluate', async (_, { rejectWithValue }) => {
  try {
    return await ruleService.evaluate();
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

const rulesSlice = createSlice({
  name: 'rules',
  initialState: {
    items: [],
    status: 'idle',
    error: null,
    saving: { ruleType: null, error: null },
    evaluation: { status: 'idle', summary: null, error: null },
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRules.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchRules.fulfilled, (state, { payload }) => {
        state.items = payload;
        state.status = 'succeeded';
      })
      .addCase(fetchRules.rejected, (state, { payload }) => {
        state.status = 'failed';
        state.error = payload?.message ?? 'Could not load rules';
      })
      .addCase(updateRule.pending, (state, { meta }) => {
        state.saving = { ruleType: meta.arg.ruleType, error: null };
      })
      .addCase(updateRule.fulfilled, (state, { payload }) => {
        state.items = state.items.map((r) => (r.ruleType === payload.ruleType ? payload : r));
        state.saving = { ruleType: null, error: null };
      })
      .addCase(updateRule.rejected, (state, { payload, meta }) => {
        state.saving = { ruleType: meta.arg.ruleType, error: payload ?? { message: 'Not saved' } };
      })
      .addCase(runRulesNow.pending, (state) => {
        state.evaluation = { status: 'loading', summary: null, error: null };
      })
      .addCase(runRulesNow.fulfilled, (state, { payload }) => {
        state.evaluation = { status: 'succeeded', summary: payload, error: null };
      })
      .addCase(runRulesNow.rejected, (state, { payload }) => {
        state.evaluation = {
          status: 'failed',
          summary: null,
          error: payload?.message ?? 'Evaluation failed',
        };
      });
  },
});

export default rulesSlice.reducer;

export const selectRules = (state) => state.rules;
