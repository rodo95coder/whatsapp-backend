// src/utils/logger.js

import fs from "fs-extra";
import winston from "winston";
import config from "../config/env.js";

const { logLevel } = config;

fs.ensureDirSync("logs");

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level.toUpperCase()}] ${stack || message}`;
});

const logger = winston.createLogger({
  level: logLevel || "info",

  format: combine(
    errors({ stack: true }),
    timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    logFormat,
  ),

  transports: [
    new winston.transports.Console({
      handleExceptions: true,

      format: combine(
        colorize(),
        timestamp({
          format: "YYYY-MM-DD HH:mm:ss",
        }),
        logFormat,
      ),
    }),

    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      handleExceptions: true,
    }),

    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      handleExceptions: true,
    }),
  ],

  rejectionHandlers: [
    new winston.transports.File({
      filename: "logs/rejections.log",
    }),
  ],

  exceptionHandlers: [
    new winston.transports.File({
      filename: "logs/exceptions.log",
    }),
  ],
});

export default logger;