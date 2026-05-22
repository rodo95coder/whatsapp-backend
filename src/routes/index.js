// src/routes/index.js

import express from 'express';
import whatsappRoutes from './whatsappRoutes.js';
import webhookRoutes from './webhookRoutes.js';
import extraRoutes from './extra.js';

const router = express.Router();

router.use('/whatsapp', whatsappRoutes);
router.use('/webhook', webhookRoutes);
router.use('/extra', extraRoutes);

export default router;