import { api } from './api';
import { cleanParams } from './params';

export const orderService = {
  async list(params) {
    const { data } = await api.get('/orders', { params: cleanParams(params) });
    return data;
  },
  async get(id) {
    const { data } = await api.get(`/orders/${id}`);
    return data.data;
  },
};
