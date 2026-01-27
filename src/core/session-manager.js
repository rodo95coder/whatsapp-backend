// src/core/session-manager.js
import fs from 'fs-extra';
import path from 'path';
import { create } from '@wppconnect-team/wppconnect';
import {
  sessionsPath,
  multiSessionsFile,
  puppeteerPath,
  logLevel
} from '../config/env.js';
import logger from '../utils/logger.js';

// In-memory active clients map
const activeClients = {}; // { [companyId]: { client, status, qr, lastError } }

async function ensureFolders() {
  await fs.ensureDir(sessionsPath);
  await fs.ensureDir(path.dirname(multiSessionsFile));
}

function loadPersistedSessions() {
  try {
    if (!fs.existsSync(multiSessionsFile)) return {};
    const raw = fs.readFileSync(multiSessionsFile, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    logger.error('Error reading multiSessionsFile', e);
    return {};
  }
}

function savePersistedSessions(data) {
  try {
    fs.writeFileSync(multiSessionsFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    logger.error('Error saving multiSessionsFile', e);
  }
}

function persistStatus(companyId, statusObj) {
  const sessions = loadPersistedSessions();
  sessions[companyId] = { ...sessions[companyId], ...statusObj };
  savePersistedSessions(sessions);
}

export async function loadSessions() {
  await ensureFolders();
  const sessions = loadPersistedSessions();
  for (const companyId of Object.keys(sessions)) {
    // start each saved session, but non-blocking
    try {
      initSession(companyId).catch((e) => logger.error('initSession error', e));
    } catch (e) {
      logger.error('Error loadSessions initSession', e);
    }
  }
}

/**
 * Initializes or returns existing session for a companyId
 */
export async function initSession(companyId, opts = {}) {
  if (!companyId) throw new Error('companyId requerido');

  // If client already active, return info
  if (activeClients[companyId] && activeClients[companyId].client) {
    return { success: true, msg: 'Session already active', status: activeClients[companyId].status || 'CONNECTED' };
  }

  // create client options
  const createOptions = {
    session: String(companyId),
    // puppeteer options (puppeteerPath must exist in the server)
    puppeteer: {
      executablePath: puppeteerPath,//Quitar comentario para configurar con VPS
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    },
    // logger config (wppconnect has logging options in some versions)
    disableWelcome: true,
    logLevel: logLevel || 'info',
    ...opts
  };

  let client = null;
  let lastQR = null;
  let status = 'CONNECTING';
  activeClients[companyId] = { client: null, qr: null, status };

  persistStatus(companyId, { status: 'CONNECTING', updatedAt: new Date().toISOString() });

  try {
    client = await create({
      ...createOptions,
      // catchQR gets base64 or string; store it
      catchQR: (qr) => {
        lastQR = qr;
        activeClients[companyId].qr = qr;
        activeClients[companyId].status = 'QR';
        persistStatus(companyId, { status: 'QR', qr: qr, updatedAt: new Date().toISOString() });
      },
      statusFind: (statusFind) => {
        // statusFind is informative; we keep logger
        logger.info(`[${companyId}] statusFind -> ${statusFind}`);
      }
    });

    // attach event handlers if available
    if (typeof client.onStateChange === 'function') {
      client.onStateChange((uState) => {
        logger.info(`[${companyId}] onStateChange -> ${uState}`);
        if (uState === 'CONNECTED' || uState === 'CONFLICT' || uState === 'SYNCING') {
          activeClients[companyId].status = 'CONNECTED';
          persistStatus(companyId, { status: 'CONNECTED', updatedAt: new Date().toISOString() });
        } else if (uState === 'DISCONNECTED') {
          activeClients[companyId].status = 'DISCONNECTED';
          persistStatus(companyId, { status: 'DISCONNECTED', updatedAt: new Date().toISOString() });
          // try reconnect after a delay
          setTimeout(() => {
            logger.info(`[${companyId}] attempting reconnect after DISCONNECTED`);
            initSession(companyId).catch((e) => logger.error('Re-init error', e));
          }, 3000);
        } else {
          activeClients[companyId].status = uState;
          persistStatus(companyId, { status: uState, updatedAt: new Date().toISOString() });
        }
      });
    }

    // Optional event hooks: messages, ack, etc.
    if (typeof client.onMessage === 'function') {
      client.onMessage((message) => {
        logger.info(`[${companyId}] onMessage received: ${message.id || 'no-id'}`);
        // Here you can implement webhook dispatch in background
      });
    }

    // Save client reference
    activeClients[companyId].client = client;
    activeClients[companyId].status = 'CONNECTED';
    activeClients[companyId].qr = lastQR;

    persistStatus(companyId, { createdAt: new Date().toISOString(), status: 'CONNECTED' });

    return { success: true, msg: 'Session started', status: 'CONNECTED' };
  } catch (e) {
    logger.error(`[${companyId}] initSession error`, e);
    activeClients[companyId].lastError = e?.message || String(e);
    activeClients[companyId].status = 'ERROR';
    persistStatus(companyId, { status: 'ERROR', lastError: activeClients[companyId].lastError, updatedAt: new Date().toISOString() });
    throw e;
  }
}

export function getQR(companyId) {
  return activeClients[companyId]?.qr || null;
}

export function getStatus(companyId) {
  return activeClients[companyId]?.status || 'NOT_FOUND';
}

export async function sendMessage({ companyId, numbers = [], text = '', filePath = null, fileName = null }) {
  const entry = activeClients[companyId];
  if (!entry || !entry.client) {
    return { success: false, msg: 'Session not active' };
  }
  const client = entry.client;
  const results = [];
  try {
    for (const number of numbers) {
      const to = number.includes('@c.us') ? number : `${number}@c.us`;
      if (filePath) {
        // send file with caption (wppconnect .sendFile or .sendImageFromBase64 depending on API)
        // Try generic method .sendFile; adjust to your wppconnect version if necessary
        if (typeof client.sendFile === 'function') {
          const sent = await client.sendFile(to, filePath, fileName || undefined, text || undefined);
          results.push({ number, ok: true, result: sent });
        } else if (typeof client.sendImage === 'function') {
          const sent = await client.sendImage(to, filePath, fileName || undefined, text || undefined);
          results.push({ number, ok: true, result: sent });
        } else {
          results.push({ number, ok: false, msg: 'sendFile/sendImage not available on client API' });
        }
      } else {
        if (typeof client.sendText === 'function') {
          const sent = await client.sendText(to, text);
          results.push({ number, ok: true, result: sent });
        } else if (typeof client.sendMessage === 'function') {
          const sent = await client.sendMessage(to, { text });
          results.push({ number, ok: true, result: sent });
        } else {
          results.push({ number, ok: false, msg: 'sendText/sendMessage not available on client API' });
        }
      }
    }
    return { success: true, results };
  } catch (e) {
    logger.error('sendMessage error', e);
    return { success: false, msg: e.message || String(e) };
  }
}

export async function logout(companyId) {
  const entry = activeClients[companyId];
  if (!entry || !entry.client) return { success: false, msg: 'Session not active' };

  try {
    if (typeof entry.client.close === 'function') {
      await entry.client.close();
    }
    // Remove persisted status
    const persisted = loadPersistedSessions();
    delete persisted[companyId];
    savePersistedSessions(persisted);

    delete activeClients[companyId];
    return { success: true, msg: 'Logged out' };
  } catch (e) {
    logger.error('logout error', e);
    return { success: false, msg: e.message || String(e) };
  }
}

// Export helper to inspect active clients (useful for debugging)
export function getActiveClients() {
  return Object.keys(activeClients);
}

export default {
  initSession,
  loadSessions,
  getQR,
  getStatus,
  sendMessage,
  logout,
  getActiveClients
};
