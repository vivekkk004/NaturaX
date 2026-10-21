import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { userService } from '../../services/userService';
import { toApiError } from '../../services/api';

/** Paginated list for the Employees page. */
export const fetchEmployees = createAsyncThunk(
  'employees/fetchList',
  async (_, { getState, rejectWithValue }) => {
    const { page, limit, search } = getState().employees.list;
    try {
      return await userService.list({ page, limit, search, sort: 'name' });
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

/** Active users for "assign to" dropdowns and employee filters (manager only). */
export const fetchAssignableUsers = createAsyncThunk(
  'employees/fetchOptions',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await userService.list({ isActive: true, limit: 100, sort: 'name' });
      return data;
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

export const createEmployee = createAsyncThunk(
  'employees/create',
  async (body, { rejectWithValue }) => {
    try {
      return await userService.create(body);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

export const updateEmployee = createAsyncThunk(
  'employees/update',
  async ({ id, changes }, { rejectWithValue }) => {
    try {
      return await userService.update(id, changes);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
);

const employeesSlice = createSlice({
  name: 'employees',
  initialState: {
    list: {
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      page: 1,
      limit: 20,
      search: '',
      status: 'idle',
      error: null,
    },
    options: { items: [], status: 'idle' },
    mutation: { status: 'idle', error: null },
  },
  reducers: {
    setEmployeePage(state, { payload }) {
      state.list.page = payload;
    },
    setEmployeeSearch(state, { payload }) {
      state.list.search = payload;
      state.list.page = 1;
    },
    resetEmployeeMutation(state) {
      state.mutation = { status: 'idle', error: null };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmployees.pending, (state) => {
        state.list.status = 'loading';
        state.list.error = null;
      })
      .addCase(fetchEmployees.fulfilled, (state, { payload }) => {
        state.list.items = payload.data;
        state.list.pagination = payload.pagination;
        state.list.status = 'succeeded';
      })
      .addCase(fetchEmployees.rejected, (state, { payload }) => {
        state.list.status = 'failed';
        state.list.error = payload?.message ?? 'Could not load employees';
      })
      .addCase(fetchAssignableUsers.pending, (state) => {
        state.options.status = 'loading';
      })
      .addCase(fetchAssignableUsers.fulfilled, (state, { payload }) => {
        state.options = { items: payload, status: 'succeeded' };
      })
      .addCase(fetchAssignableUsers.rejected, (state) => {
        state.options.status = 'failed';
      })
      .addCase(createEmployee.pending, (state) => {
        state.mutation = { status: 'loading', error: null };
      })
      .addCase(createEmployee.fulfilled, (state) => {
        state.mutation = { status: 'succeeded', error: null };
        state.options.status = 'idle'; // dropdown options must be reloaded
      })
      .addCase(createEmployee.rejected, (state, { payload }) => {
        state.mutation = { status: 'failed', error: payload ?? { message: 'Not saved' } };
      })
      .addCase(updateEmployee.fulfilled, (state, { payload }) => {
        state.list.items = state.list.items.map((u) => (u.id === payload.id ? payload : u));
        state.options.status = 'idle';
      });
  },
});

export const { setEmployeePage, setEmployeeSearch, resetEmployeeMutation } = employeesSlice.actions;
export default employeesSlice.reducer;

export const selectEmployeeList = (state) => state.employees.list;
export const selectEmployeeMutation = (state) => state.employees.mutation;
export const selectAssignableUsers = (state) => state.employees.options;
