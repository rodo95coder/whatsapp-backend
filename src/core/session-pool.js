// src/core/session-pool.js
import { initSession, logout, getStatus } from './session-manager.js';
import logger from '../utils/logger.js';

const MAX_ACTIVE_SESSIONS = parseInt(process.env.MAX_ACTIVE_SESSIONS || '3', 10);
const SESSION_IDLE_TIMEOUT = parseInt(process.env.SESSION_IDLE_TIMEOUT || '300000', 10);

const pool = new Map(); 

function getActiveCount() {
  return pool.size;
}

function getLeastRecentlyUsed() {
  let oldest = null;

  for (const [companyId, data] of pool.entries()) {
    if (!oldest || data.lastUsedAt < oldest.lastUsedAt) {
      oldest = { companyId, ...data };
    }
  }

  return oldest;
}

async function ensureCapacity() {
  if (getActiveCount() < MAX_ACTIVE_SESSIONS) return;

  const lru = getLeastRecentlyUsed();
  if (!lru) return;

  logger.warn(`Session pool full. Closing LRU session: ${lru.companyId}`);
  await logout(lru.companyId);
  pool.delete(lru.companyId);
}

export async function acquireSession(companyId) {
  if (pool.has(companyId)) {
    pool.get(companyId).lastUsedAt = Date.now();
    return;
  }

  await ensureCapacity();

  logger.info(`Starting session for ${companyId}`);
  await initSession(companyId);

  pool.set(companyId, { lastUsedAt: Date.now() });
}

export function releaseInactiveSessions() {
  const now = Date.now();

  for (const [companyId, data] of pool.entries()) {
    if (now - data.lastUsedAt > SESSION_IDLE_TIMEOUT) {
      logger.info(`Releasing idle session: ${companyId}`);
      logout(companyId).catch(() => {});
      pool.delete(companyId);
    }
  }
}

setInterval(releaseInactiveSessions, 60 * 1000);
