// src/routes/webhookRoutes.js

import express from "express";

import validateToken from "../middlewares/validateToken.js";
import { validateCompanyId } from "../middlewares/validateCompanyId.js";
import { setWebhook, getWebhook } from "../controllers/webhookController.js";

const router = express.Router();

router.use(validateToken);

router.post("/:companyId/webhook", validateCompanyId, setWebhook);
router.get("/:companyId/webhook", validateCompanyId, getWebhook);

export default router;
