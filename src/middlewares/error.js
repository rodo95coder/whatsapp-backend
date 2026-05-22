// src/middlewares/error.js

import logger from "../utils/logger.js";

export default function errorHandler(err, req, res, next) {
  logger.error(err?.stack || err?.message || String(err));

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
}
