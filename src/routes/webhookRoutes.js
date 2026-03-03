// src/routes/webhookRoutes.js
import express from "express";
import { setWebhook, getWebhook } from "../controllers/webhookController.js";

const router = express.Router();

router.post("/:companyId/webhook", setWebhook);
router.get("/:companyId/webhook", getWebhook);

export default router;
