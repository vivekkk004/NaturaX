import { api } from './api';
import { cleanParams } from './params';

export const taskService = {
  async list(params) {
    const { data } = await api.get('/tasks', { params: cleanParams(params) });
    return data; // { data, pagination }
  },
  async get(id) {
    const { data } = await api.get(`/tasks/${id}`);
    return data.data;
  },
  async history(id) {
    const { data } = await api.get(`/tasks/${id}/audit`);
    return data.data;
  },
  async updateStatus(id, body) {
    const { data } = await api.patch(`/tasks/${id}/status`, body);
    return data.data;
  },
  async assign(id, body) {
    const { data } = await api.patch(`/tasks/${id}/assign`, cleanParams(body));
    return data.data;
  },
};
