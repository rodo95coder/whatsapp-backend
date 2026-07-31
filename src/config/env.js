// src/config/env.js

import fs from "fs-extra";
import path from "path";
import process from "process";

const cwd = process.cwd();

function toNumber(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return value === "true";
}

const sessionsPath =
  process.env.SESSIONS_PATH ||
  path.join(cwd, "userSessions");

const tempPath =
  process.env.TEMP_PATH ||
  path.join(cwd, "temp");

fs.ensureDirSync(sessionsPath);
fs.ensureDirSync(tempPath);
fs.ensureDirSync(path.join(cwd, "logs"));

const config = {
  nodeEnv:
    process.env.NODE_ENV || "development",

  port:
    toNumber(process.env.PORT, 3000),

  globalToken:
    process.env.GLOBAL_TOKEN,

  puppeteerPath:
    process.env.PUPPETEER_EXECUTABLE_PATH || null,

  sessionsPath,

  tempPath,

  logLevel:
    process.env.LOG_LEVEL || "info",

  clientMaxBodySize:
    process.env.CLIENT_MAX_BODY_SIZE || "50mb",

  webhookTimeoutMs:
    toNumber(process.env.WEBHOOK_TIMEOUT_MS, 8000),

  autoReconnect:
    toBoolean(process.env.AUTO_RECONNECT, true),

  autoInitOnCrash:
    toBoolean(process.env.AUTO_INIT_ON_CRASH, true),

  maxQrAttempts:
    toNumber(process.env.MAX_QR_ATTEMPTS, 20),

  qrTimeoutMs:
    toNumber(process.env.QR_TIMEOUT_MS, 180000),

  sessionLockTtl:
    toNumber(process.env.SESSION_LOCK_TTL, 15000),

  sendMessageTimeoutMs:
    toNumber(process.env.SEND_MESSAGE_TIMEOUT_MS, 15000),

  initSessionTimeoutMs:
    toNumber(process.env.INIT_SESSION_TIMEOUT_MS, 180000),

  browserCloseTimeoutMs:
    toNumber(process.env.BROWSER_CLOSE_TIMEOUT_MS, 10000),

  puppeteerProtocolTimeoutMs:
    toNumber(process.env.PUPPETEER_PROTOCOL_TIMEOUT_MS, 60000),

  sessionWatchdogIntervalMs:
    toNumber(process.env.SESSION_WATCHDOG_INTERVAL_MS, 30000),

  logoutTimeoutMs:
    toNumber(process.env.LOGOUT_TIMEOUT_MS, 15000),

  maxQueuePerSession:
    toNumber(process.env.MAX_QUEUE_PER_SESSION, 1000),
};

if (!config.globalToken) {
  throw new Error("GLOBAL_TOKEN is required");
}

export default config;
