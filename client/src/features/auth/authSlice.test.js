import { describe, it, expect } from 'vitest';
import authReducer, { login, logout, sessionExpired, tokenRefreshed } from './authSlice';
import { rootReducer } from '../../store';
import { setTaskFilters } from '../tasks/tasksSlice';

const user = { id: 'u1', name: 'Meera Nair', role: 'MANAGER' };

describe('authSlice', () => {
  it('stores the session on login and clears the error', () => {
    const pending = authReducer(undefined, login.pending('req', {}));
    const state = authReducer(pending, login.fulfilled({ user, accessToken: 'jwt' }, 'req', {}));

    expect(state).toMatchObject({
      user,
      accessToken: 'jwt',
      status: 'authenticated',
      loginStatus: 'idle',
      error: null,
    });
  });

  it('keeps the server message on a failed login', () => {
    const state = authReducer(
      undefined,
      login.rejected(null, 'req', {}, { message: 'Invalid email or password' }),
    );
    expect(state).toMatchObject({
      loginStatus: 'failed',
      error: 'Invalid email or password',
      accessToken: null,
    });
  });

  it('accepts a silently refreshed token and ends the session when refresh fails', () => {
    const refreshed = authReducer(undefined, tokenRefreshed({ user, accessToken: 'new' }));
    expect(refreshed.accessToken).toBe('new');

    const expired = authReducer(refreshed, sessionExpired());
    expect(expired).toMatchObject({ accessToken: null, user: null, status: 'unauthenticated' });
    expect(expired.error).toMatch(/expired/);
  });
});

describe('rootReducer', () => {
  it("wipes every slice on logout so the next user never sees the previous user's data", () => {
    let state = rootReducer(undefined, tokenRefreshed({ user, accessToken: 'jwt' }));
    state = rootReducer(state, setTaskFilters({ priority: 'HIGH' }));
    expect(state.tasks.filters.priority).toBe('HIGH');

    state = rootReducer(state, logout.fulfilled(undefined, 'req'));

    expect(state.tasks.filters.priority).toBe('');
    expect(state.auth).toMatchObject({ status: 'unauthenticated', accessToken: null });
  });
});
