import { api } from './api';
import { cleanParams } from './params';

export const userService = {
  async list(params) {
    const { data } = await api.get('/users', { params: cleanParams(params) });
    return data;
  },
  async create(body) {
    const { data } = await api.post('/users', body);
    return data.data;
  },
  async update(id, changes) {
    const { data } = await api.patch(`/users/${id}`, changes);
    return data.data;
  },
};
