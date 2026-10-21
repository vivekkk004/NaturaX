import { Router } from 'express';
import { ROLES } from '../../constants/roles.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { uploadSingleFile } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { idParamSchema } from '../../utils/validation.js';
import { importBodySchema, listImportsQuerySchema } from './import.validation.js';
import * as importController from './import.controller.js';

const router = Router();

// Importing data and reading import reports is a manager responsibility.
router.use(authenticate, authorize(ROLES.MANAGER));

// multer must run before validate: the form fields only exist after the multipart body is parsed.
router.post(
  '/',
  uploadSingleFile('file'),
  validate({ body: importBodySchema }),
  importController.upload,
);
router.get('/', validate({ query: listImportsQuerySchema }), importController.list);
router.get('/:id', validate({ params: idParamSchema }), importController.getById);
router.get('/:id/file', validate({ params: idParamSchema }), importController.downloadFile);

export default router;
