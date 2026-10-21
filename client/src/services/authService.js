import { api } from './api';

export const authService = {
  async login(credentials) {
    const { data } = await api.post('/auth/login', credentials);
    return data.data; // { accessToken, user }
  },
  /** Uses the httpOnly refresh cookie; restores the session after a page reload. */
  async refresh() {
    const { data } = await api.post('/auth/refresh');
    return data.data;
  },
  async logout() {
    await api.post('/auth/logout');
  },
};
