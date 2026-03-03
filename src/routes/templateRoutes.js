// src/routes/templateRoutes.js
import express from "express";
import { sendTemplate } from "../controllers/templateController.js";

const router = express.Router();

router.post("/:companyId/send-template", sendTemplate);

export default router;