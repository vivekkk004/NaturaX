import { Router } from 'express';
import { ROLES } from '../../constants/roles.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParamSchema } from '../../utils/validation.js';
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from './user.validation.js';
import * as userController from './user.controller.js';

const router = Router();

// User management is manager-only; applying the guards once covers every route below.
router.use(authenticate, authorize(ROLES.MANAGER));

router.get('/', validate({ query: listUsersQuerySchema }), userController.list);
router.post('/', validate({ body: createUserSchema }), userController.create);
router.get('/:id', validate({ params: idParamSchema }), userController.getById);
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserSchema }),
  userController.update,
);

export default router;
