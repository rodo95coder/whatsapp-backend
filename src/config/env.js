// src/config/env.js - Usando un objeto
import path from 'path';
import process from 'process';

const cwd = process.cwd();
const sessionsPath = process.env.SESSIONS_PATH || path.join(cwd, 'sessions');

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  globalToken: process.env.GLOBAL_TOKEN || 'token',
  puppeteerPath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
  sessionsPath: sessionsPath,
  tempPath: process.env.TEMP_PATH || path.join(cwd, 'temp'),
  logLevel: process.env.LOG_LEVEL || 'info',
  clientMaxBodySize: process.env.CLIENT_MAX_BODY_SIZE || '50mb',
  webhookTimeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '8000', 10),
  multiSessionsFile: process.env.MULTI_SESSION_FILE || 
  path.join(sessionsPath, 'multi-client.json')
};

export default config;