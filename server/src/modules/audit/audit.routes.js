import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { listAuditQuerySchema } from './audit.validation.js';
import * as auditController from './audit.controller.js';

const router = Router();

// Read-only by design: there is deliberately no POST/PATCH/DELETE on the audit trail.
router.get('/', authenticate, validate({ query: listAuditQuerySchema }), auditController.list);

export default router;
