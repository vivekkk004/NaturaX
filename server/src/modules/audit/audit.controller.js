import * as auditService from './audit.service.js';

export async function list(req, res) {
  res.json(await auditService.listAudit(req.validatedQuery, req.user));
}
