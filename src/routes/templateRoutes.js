const express = require("express");
const router = express.Router();

const { sendTemplate } = require("../controllers/templateController.js");

router.post("/:companyId/send-template", sendTemplate);

module.exports = router;
