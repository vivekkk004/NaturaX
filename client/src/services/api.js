import axios from 'axios';

/**
 * The single configured HTTP client. Every service module imports this instance;
 * components never import axios directly.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true, // send the httpOnly refresh-token cookie
  timeout: 30_000,
});

/**
 * Normalises any axios failure into a plain, serialisable object that can live in Redux state:
 * { message, code, status, details }.
 */
export function toApiError(error) {
  const body = error?.response?.data?.error;
  let message = body?.message;
  if (!message && error?.code === 'ECONNABORTED') message = 'The request timed out';
  if (!message && error?.request && !error?.response) message = 'Cannot reach the server';
  return {
    message: message || error?.message || 'Something went wrong',
    code: body?.code ?? null,
    status: error?.response?.status ?? null,
    details: body?.details ?? null,
  };
}

export const getErrorMessage = (error) => toApiError(error).message;

const AUTH_URLS = ['/auth/login', '/auth/refresh', '/auth/logout'];
const REFRESHABLE_CODES = ['TOKEN_EXPIRED', 'INVALID_TOKEN'];

/**
 * Wires authentication into every request. Called once with the store (instead of importing the
 * store here) to avoid a circular import: store -> slices -> services -> api -> store.
 *
 * - Request: attach the in-memory access token.
 * - Response 401 with an expired/invalid token: call /auth/refresh ONCE (the httpOnly cookie is
 *   sent automatically), then retry the original request. Requests that fail while a refresh is
 *   already running wait for that same refresh ("single-flight") instead of starting their own.
 * - If the refresh fails, the session is over: the store logs the user out.
 */
export function setupInterceptors(store, { onRefreshed, onSessionExpired }) {
  let refreshPromise = null;

  api.interceptors.request.use((config) => {
    const token = store.getState().auth.accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config;
      const code = error.response?.data?.error?.code;
      const isAuthCall = AUTH_URLS.some((url) => original?.url?.startsWith(url));

      if (
        error.response?.status !== 401 ||
        !REFRESHABLE_CODES.includes(code) ||
        isAuthCall ||
        original._retried
      ) {
        return Promise.reject(error);
      }

      original._retried = true;
      try {
        refreshPromise ??= api.post('/auth/refresh').finally(() => {
          refreshPromise = null;
        });
        const { data } = await refreshPromise;
        store.dispatch(onRefreshed(data.data));
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        store.dispatch(onSessionExpired());
        return Promise.reject(refreshError);
      }
    },
  );
}
