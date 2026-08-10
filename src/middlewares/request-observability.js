import config from "../config/env.js";
import logger from "../utils/logger.js";

export default function requestObservability(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (durationMs >= config.slowRequestMs) {
      logger.warn(`http.slow method=${req.method} path=${req.originalUrl} status=${res.statusCode} durationMs=${Math.round(durationMs)}`);
    }
  });

  next();
}
