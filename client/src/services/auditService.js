import { api } from './api';
import { cleanParams } from './params';

export const auditService = {
  async list(params) {
    const { data } = await api.get('/audit', { params: cleanParams(params) });
    return data;
  },
};
