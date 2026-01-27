const express = require("express");
const router = express.Router();

const { setWebhook, getWebhook } = require("../controllers/webhookController.js");

// POST configurar webhook
router.post("/:companyId/webhook", setWebhook);

// GET obtener webhook actual
router.get("/:companyId/webhook", getWebhook);

module.exports = router;
