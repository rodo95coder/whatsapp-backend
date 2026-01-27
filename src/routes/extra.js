const express = require('express');
const router = express.Router();
const validateToken = require('../middlewares/validateToken.js');
const extra = require('../controllers/extra.js');

router.use(validateToken);

router.post('/verify-number', extra.verifyNumber);
router.post('/send-bulk', extra.sendBulk);
router.post('/send-template', extra.sendTemplate);

module.exports = router;
