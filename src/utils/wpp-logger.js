import { createLogger, format, transports } from "winston";

import config from "../config/env.js";

// WPPConnect emits one debug entry for each event. Keep warnings and errors
// visible while preventing normal traffic from overwhelming application logs.
const wppLogger = createLogger({
  level: config.wppLogLevel,
  format: format.printf(({ level, message }) => `[wppconnect:${level}] ${message}`),
  transports: [new transports.Console()],
});

export default wppLogger;
