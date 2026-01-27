// src/middlewares/error.js
import logger from '../utils/logger.js';

export default function errorHandler(err, req, res, next) {
  // logger debe exponer .error
  try {
    logger.error && logger.error(err.stack || err.message || String(err));
  } catch (e) {
    // ignore
  }
  res.status(500).json({ success: false, msg: 'Internal Server Error' });
}
