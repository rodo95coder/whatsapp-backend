import express from 'express';
import * as ctrl from '../controllers/whatsappController.js'; 
import validateToken from '../middlewares/validateToken.js';

const router = express.Router();

router.use(validateToken);

router.post('/init-session', ctrl.initSession);
router.get('/:companyId/qr', ctrl.getQR);
router.get('/:companyId/status', ctrl.getStatus);
router.post('/:companyId/send', ctrl.send);
router.post('/:companyId/logout', ctrl.logout);

export default router;