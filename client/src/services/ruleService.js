import { api } from './api';

export const ruleService = {
  async list() {
    const { data } = await api.get('/rules');
    return data.data;
  },
  async update(ruleType, changes) {
    const { data } = await api.patch(`/rules/${ruleType}`, changes);
    return data.data;
  },
  async evaluate(asOf) {
    const { data } = await api.post('/rules/evaluate', asOf ? { asOf } : {});
    return data.data;
  },
};
