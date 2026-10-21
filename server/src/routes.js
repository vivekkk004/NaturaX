import { Router } from 'express';
import healthRoutes from './modules/health/health.routes.js';

/** Single place where every feature module is mounted under /api. */
const router = Router();

router.use('/health', healthRoutes);

export default router;
