import { api } from './api';
import { cleanParams } from './params';

export const dashboardService = {
  async get(filters) {
    const { data } = await api.get('/dashboard', { params: cleanParams(filters) });
    return data.data;
  },
};
