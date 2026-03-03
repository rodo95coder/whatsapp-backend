// src/routes/whatsappRoutes.js

import express from 'express';
import * as ctrl from '../controllers/whatsappController.js';
import validateToken from '../middlewares/validateToken.js';
import { validateCompanyId } from '../middlewares/validateCompanyId.js';

const router = express.Router();

router.post('/init-session', validateCompanyId, ctrl.initSession);
// Aplicar middleware primero
router.use(validateToken);
// Rutas WhatsApp
router.get('/:companyId/qr', validateCompanyId, ctrl.getQR);
router.get('/:companyId/status', validateCompanyId, ctrl.getStatus);
router.post('/:companyId/send', validateCompanyId, ctrl.send);
router.post('/:companyId/logout', validateCompanyId, ctrl.logout);

export default router;