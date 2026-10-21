import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParamSchema } from '../../utils/validation.js';
import { listOrdersQuerySchema } from './order.validation.js';
import * as orderController from './order.controller.js';

const router = Router();

// Both roles may read orders; the service restricts employees to their own.
router.use(authenticate);

router.get('/', validate({ query: listOrdersQuerySchema }), orderController.list);
router.get('/:id', validate({ params: idParamSchema }), orderController.getById);

export default router;
