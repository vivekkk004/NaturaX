import { api } from './api';
import { cleanParams } from './params';

export const importService = {
  /** Multipart upload; `asOf` is optional (deterministic evaluation time for demos). */
  async upload(file, { asOf } = {}) {
    const form = new FormData();
    form.append('file', file);
    if (asOf) form.append('asOf', asOf);
    const { data } = await api.post('/imports', form, { timeout: 120_000 });
    return data.data;
  },
  async list(params) {
    const { data } = await api.get('/imports', { params: cleanParams(params) });
    return data;
  },
  async get(id) {
    const { data } = await api.get(`/imports/${id}`);
    return data.data;
  },
};
