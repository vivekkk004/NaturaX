import { getDashboard } from './dashboard.service.js';

export async function summary(req, res) {
  res.json({ data: await getDashboard(req.validatedQuery, req.user) });
}
