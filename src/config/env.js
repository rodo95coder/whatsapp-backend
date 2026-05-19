// src/config/env.js
import path from "path";
import process from "process";

const cwd = process.cwd();

// =====================================
// PATHS
// =====================================
const userSessionsPath =
  process.env.SESSIONS_PATH || path.join(cwd, "userSessions");

const tempPath =
  process.env.TEMP_PATH || path.join(cwd, "temp");

// =====================================
// CONFIG
// =====================================
const config = {
  // =========================
  // SERVER
  // =========================
  port: parseInt(process.env.PORT || "3000", 10),

  // =========================
  // AUTH
  // =========================
  globalToken:
    process.env.GLOBAL_TOKEN || "TOKEN_MASTER_2025",

  // =========================
  // CHROME / PUPPETEER
  // =========================
  puppeteerPath:
    process.env.PUPPETEER_EXECUTABLE_PATH || null,

  // =========================
  // SESSIONS
  // =========================
  sessionsPath: userSessionsPath,

  multiSessionsFile:
    process.env.MULTI_SESSION_FILE ||
    path.join(userSessionsPath, "multi-client.json"),

  // =========================
  // MEDIA / TEMP
  // =========================
  tempPath,

  // =========================
  // LOGS
  // =========================
  logLevel:
    process.env.LOG_LEVEL || "info",

  // =========================
  // BODY LIMITS
  // =========================
  clientMaxBodySize:
    process.env.CLIENT_MAX_BODY_SIZE || "50mb",

  // =========================
  // WEBHOOK
  // =========================
  webhookTimeoutMs: parseInt(
    process.env.WEBHOOK_TIMEOUT_MS || "8000",
    10
  ),

  // =========================
  // SESSION BEHAVIOR
  // =========================
  autoReconnect:
    process.env.AUTO_RECONNECT !== "false",

  autoInitOnCrash:
    process.env.AUTO_INIT_ON_CRASH !== "false",

  // =========================
  // QR
  // =========================
  maxQrAttempts: parseInt(
    process.env.MAX_QR_ATTEMPTS || "2",
    10
  ),

  qrTimeoutMs: parseInt(
    process.env.QR_TIMEOUT_MS || "180000",
    10
  ),

  // =========================
  // TIMEOUTS
  // =========================
  sessionLockTtl: parseInt(
    process.env.SESSION_LOCK_TTL || "15000",
    10
  ),

  sendMessageTimeoutMs: parseInt(
    process.env.SEND_MESSAGE_TIMEOUT_MS || "15000",
    10
  ),

  initSessionTimeoutMs: parseInt(
    process.env.INIT_SESSION_TIMEOUT_MS || "180000",
    10
  ),

  logoutTimeoutMs: parseInt(
    process.env.LOGOUT_TIMEOUT_MS || "15000",
    10
  ),

  // =========================
  // QUEUES
  // =========================
  maxQueuePerSession: parseInt(
    process.env.MAX_QUEUE_PER_SESSION || "1000",
    10
  ),
};

export default config;