// src/routes/whatsappRoutes.js

import express from "express";
import * as ctrl from "../controllers/whatsappController.js";
import validateToken from "../middlewares/validateToken.js";
import { validateCompanyId } from "../middlewares/validateCompanyId.js";

const router = express.Router();

router.use(validateToken);

router.post("/init-session", validateCompanyId, ctrl.initSession);
router.get("/:companyId/qr", validateCompanyId, ctrl.getQR);
router.get("/:companyId/status", validateCompanyId, ctrl.getStatus);
router.post("/:companyId/send", validateCompanyId, ctrl.send);
router.post("/:companyId/logout", validateCompanyId, ctrl.logout);
router.post("/:companyId/force-reset", validateCompanyId, ctrl.forceReset);

export default router;
