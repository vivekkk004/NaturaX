import { api } from './api';

export const healthService = {
  async check() {
    const { data } = await api.get('/health');
    return data.data;
  },
};
