import axios from 'axios';

/**
 * The single configured HTTP client. Every service module imports this instance;
 * components never import axios directly. Auth interceptors are attached here in Part 7.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true, // send the httpOnly refresh-token cookie
  timeout: 30_000,
});

/** Converts any axios failure into a plain, serialisable message for UI/Redux state. */
export function getErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    (error?.code === 'ECONNABORTED' ? 'The request timed out' : null) ||
    (error?.request && !error?.response ? 'Cannot reach the server' : null) ||
    error?.message ||
    'Something went wrong'
  );
}
