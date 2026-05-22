// src/routes/extra.js

import express from "express";

import validateToken from "../middlewares/validateToken.js";
import { validateCompanyId } from "../middlewares/validateCompanyId.js";

import * as extra from "../controllers/extraController.js";

const router = express.Router();

router.use(validateToken);

router.post("/verify-number", validateCompanyId, extra.verifyNumber);
router.post("/send-bulk", validateCompanyId, extra.sendBulk);
router.post("/send-template", validateCompanyId, extra.sendTemplate);

export default router;
