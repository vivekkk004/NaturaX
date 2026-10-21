import { Router } from 'express';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import importRoutes from './modules/imports/import.routes.js';
import orderRoutes from './modules/orders/order.routes.js';
import ruleRoutes from './modules/rules/rule.routes.js';
import taskRoutes from './modules/tasks/task.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';

/** Single place where every feature module is mounted under /api. */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/imports', importRoutes);
router.use('/orders', orderRoutes);
router.use('/rules', ruleRoutes);
router.use('/tasks', taskRoutes);
router.use('/audit', auditRoutes);

export default router;
