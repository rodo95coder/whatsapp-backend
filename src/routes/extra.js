// src/routes/extra.js
import express from "express";
import validateToken from "../middlewares/validateToken.js";
import * as extra from "../controllers/extraController.js";

const router = express.Router();

router.use(validateToken);

router.post("/verify-number", extra.verifyNumber);
router.post("/send-bulk", extra.sendBulk);
router.post("/send-template", extra.sendTemplate);

export default router;