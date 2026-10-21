import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { authService } from '../../services/authService';
import { toApiError } from '../../services/api';
import { ROLES } from '../../utils/constants';

/**
 * The access token lives ONLY in Redux memory (never localStorage, so XSS cannot read it from
 * storage). After a page reload it is gone, so the app calls /auth/refresh on startup: the
 * httpOnly refresh cookie silently restores the session.
 */
export const restoreSession = createAsyncThunk(
  'auth/restoreSession',
  async (_, { rejectWithValue }) => {
    try {
      return await authService.refresh();
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
  {
    // Run at most once at a time. Refresh tokens are single-use: two parallel restores (e.g.
    // React StrictMode running the start-up effect twice) would send the same cookie twice, the
    // second call would fail, and could log the user out depending on which reply came last.
    condition: (_, { getState }) => getState().auth.status === 'idle',
  },
);

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    return await authService.login(credentials);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  try {
    await authService.logout();
  } catch {
    // Even if the server call fails, the user is logged out locally.
  }
});

const initialState = {
  user: null,
  accessToken: null,
  status: 'idle', // idle | restoring | authenticated | unauthenticated
  loginStatus: 'idle', // idle | loading | failed
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Dispatched by the axios interceptor after a silent token refresh. */
    tokenRefreshed(state, { payload }) {
      state.accessToken = payload.accessToken;
      state.user = payload.user;
      state.status = 'authenticated';
    },
    /** Dispatched by the interceptor when the refresh token is no longer valid. */
    sessionExpired() {
      return {
        ...initialState,
        status: 'unauthenticated',
        error: 'Your session has expired. Please log in again.',
      };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.pending, (state) => {
        state.status = 'restoring';
      })
      .addCase(restoreSession.fulfilled, (state, { payload }) => {
        state.user = payload.user;
        state.accessToken = payload.accessToken;
        state.status = 'authenticated';
      })
      .addCase(restoreSession.rejected, (state) => {
        state.status = 'unauthenticated';
      })
      .addCase(login.pending, (state) => {
        state.loginStatus = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, { payload }) => {
        state.user = payload.user;
        state.accessToken = payload.accessToken;
        state.status = 'authenticated';
        state.loginStatus = 'idle';
      })
      .addCase(login.rejected, (state, { payload }) => {
        state.loginStatus = 'failed';
        state.error = payload?.message ?? 'Login failed';
      })
      .addCase(logout.fulfilled, () => ({ ...initialState, status: 'unauthenticated' }));
  },
});

export const { tokenRefreshed, sessionExpired } = authSlice.actions;
export default authSlice.reducer;

export const selectAuth = (state) => state.auth;
export const selectCurrentUser = (state) => state.auth.user;
export const selectAuthStatus = (state) => state.auth.status;
export const selectIsManager = (state) => state.auth.user?.role === ROLES.MANAGER;
