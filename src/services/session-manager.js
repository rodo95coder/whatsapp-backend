// src/services/session-manager.js
import wppconnect from '@wppconnect-team/wppconnect';
import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';
import webhookService from './webhook.js';
import config from '../config/env.js';
import { execSync } from "child_process";

const { sessionsPath, puppeteerPath  } = config;
fs.ensureDirSync(sessionsPath);

// Reconnection policy
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60000;

const clients = {};      // companyId -> client instance
const qrByCompany = {};  // companyId -> qr base64
const statusByCompany = {};
const reconnectState = {}; // companyId -> { attempts, timerId }


function killOldBrowser(companyId) {
  const sessionDir = companyFolder(companyId);
  const userDataDir = path.join(sessionDir, companyId);

  // 1. Matar procesos de Chrome/Chromium (Windows y Linux)
  try { execSync("taskkill /IM chrome.exe /F"); } catch {}
  try { execSync("taskkill /IM chromium.exe /F"); } catch {}
  try { execSync("killall chrome"); } catch {}
  try { execSync("killall chromium"); } catch {}

  // 2. Eliminar el bloqueo de sesión
  const lockFile = path.join(userDataDir, "SingletonLock");
  try { fs.rmSync(lockFile, { force: true }); } catch {}

  // 3. (Opcional) eliminar crashpad files
  const crashpad = path.join(userDataDir, "Crashpad");
  try { fs.rmSync(crashpad, { recursive: true, force: true }); } catch {}

  console.log(`[${companyId}] Browser limpiado y desbloqueado`);
}

function companyFolder(companyId) {
  return path.join(sessionsPath, String(companyId));
}

function ensureCompanyFolder(companyId) {
  const f = companyFolder(companyId);
  fs.ensureDirSync(f);
  return f;
}

function readWebhookUrl(companyId) {
  try {
    const cfgPath = path.join(companyFolder(companyId), 'webhook.json');
    const obj = fs.readJsonSync(cfgPath, { throws: false });
    return obj && obj.url ? obj.url : null;
  } catch (e) { 
    return null; 
  }
}

function scheduleReconnect(companyId) {
  reconnectState[companyId] = reconnectState[companyId] || { attempts: 0, timerId: null };
  const state = reconnectState[companyId];
  state.attempts += 1;
  const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (state.attempts - 1), RECONNECT_MAX_DELAY_MS);
  logger.info(`Programado reintento para ${companyId} en ${delay}ms (intento ${state.attempts})`);

  if (state.timerId) clearTimeout(state.timerId);
  state.timerId = setTimeout(async () => {
    try {
      if (clients[companyId] && typeof clients[companyId].forceRefocus === 'function') {
        await clients[companyId].forceRefocus();
        logger.info(`forceRefocus OK para ${companyId}`);
      } else {
        // recreate
        await createClient(companyId);
      }
    } catch (err) {
      logger.error(`Reintento fallo para ${companyId}: ${err.message}`);
      if (state.attempts < RECONNECT_MAX_ATTEMPTS) scheduleReconnect(companyId);
      else {
        logger.warn(`Máx reintentos alcanzados para ${companyId}, pasando a SCAN_REQUIRED`);
        qrByCompany[companyId] = null;
        statusByCompany[companyId] = 'SCAN_REQUIRED';
        const wh = readWebhookUrl(companyId);
        if (wh) webhookService.emitWebhook(wh, { event: 'scan_required', companyId });
      }
    }
  }, delay);
}

async function createClient(companyId) {
  ensureCompanyFolder(companyId);
  logger.info(`Creando WPPConnect client para ${companyId}`);
  if (clients[companyId]) {
    try {
      await clients[companyId].close();
    } catch {}
    delete clients[companyId];
  }
  killOldBrowser(companyId);

  const client = await wppconnect.create({
    session: String(companyId),
    folderNameToken: companyFolder(companyId),
    autoClose: false,
    headless: true,
    useChrome: false,
    puppeteerOptions: {
      executablePath: puppeteerPath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    catchQR: (base64Qr) => {
      qrByCompany[companyId] = base64Qr;
      statusByCompany[companyId] = 'SCAN_PENDING';
      logger.info(`QR generado para ${companyId}`);
      const wh = readWebhookUrl(companyId);
      if (wh) webhookService.emitWebhook(wh, { event: 'qr', companyId, qr: base64Qr });
    },
    statusFind: (statusSession) => {
      logger.info(`statusFind ${companyId}: ${statusSession}`);
      statusByCompany[companyId] = statusSession;
      const wh = readWebhookUrl(companyId);
      if (wh) webhookService.emitWebhook(wh, { event: 'status', companyId, status: statusSession });
      if (['notLogged', 'desconnectedMobile'].includes(statusSession)) {
        if (clients[companyId]) delete clients[companyId];
      }
    },
    logQR: false
  });

  try {
    client.onMessage((msg) => {
      logger.info(`Mensaje entrante [${companyId}] ${msg.from}: ${msg.body || '[media]'}`);
      const wh = readWebhookUrl(companyId);
      if (wh) webhookService.emitWebhook(wh, { event: 'message', companyId, msg });
    });
  } catch (e) {
    logger.warn(`client.onMessage no disponible para ${companyId}: ${e.message}`);
  }

  try {
    client.onStateChange(async (state) => {
      logger.info(`onStateChange [${companyId}] -> ${state}`);
      statusByCompany[companyId] = state;

      // Attempt A: silent reconnection/refocus
      if (['CONFLICT', 'UNPAIRED', 'UNLAUNCHED', 'TIMEOUT'].includes(state)) {
        reconnectState[companyId] = { attempts: 0, timerId: null };
        try {
          if (typeof client.forceRefocus === 'function') {
            await client.forceRefocus();
            logger.info(`forceRefocus OK para ${companyId}`);
            return;
          }
        } catch (err) {
          logger.error(`forceRefocus fallo para ${companyId}: ${err.message}`);
        }
        scheduleReconnect(companyId);
        return;
      }

      // Attempt B: require new QR
      if (['DISCONNECTED', 'UNPAIRED_IDLE', 'CLOSED'].includes(state)) {
        logger.warn(`Estado terminal ${state} para ${companyId}: SCAN_REQUIRED`);
        qrByCompany[companyId] = null;
        statusByCompany[companyId] = 'SCAN_REQUIRED';
        const wh = readWebhookUrl(companyId);
        if (wh) webhookService.emitWebhook(wh, { event: 'scan_required', companyId });
        if (clients[companyId]) delete clients[companyId];
        return;
      }
    });
  } catch (e) {
    logger.warn(`onStateChange no disponible para ${companyId}: ${e.message}`);
  }

  clients[companyId] = client;
  reconnectState[companyId] = { attempts: 0, timerId: null };

  try {
    const isConnected = await client.isConnected();
    statusByCompany[companyId] = isConnected ? 'CONNECTED' : statusByCompany[companyId] || 'UNKNOWN';
  } catch (e) {}

  return client;
}

export async function initSession(companyId) {
  if (!companyId) throw new Error('companyId required');
  ensureCompanyFolder(companyId);

  if (clients[companyId]) {
    try {
      const connected = await clients[companyId].isConnected();
      if (connected) return { success: true, msg: 'already connected' };
    } catch (e) {}
  }

  try {
    await createClient(companyId);
    return { success: true, msg: 'session initializing' };
  } catch (e) {
    logger.error(`initSession error ${companyId}: ${e.message}`);
    return { success: false, msg: e.message };
  }
}

export function getQR(companyId) {
  const s = statusByCompany[companyId];
  if (!['SCAN_PENDING', 'SCAN_REQUIRED'].includes(s)) return null;
  return qrByCompany[companyId] || null;
}

export async function sendMessage({ companyId, numbers, text, filePath, fileName }) {
  const client = clients[companyId];
  if (!client) return { success: false, msg: 'session not active' };

  if (!Array.isArray(numbers)) numbers = [numbers];
  const results = [];
  for (const num of numbers) {
    const to = num.includes('@c.us') ? num : `${num}@c.us`;
    try {
      if (filePath) {
        await client.sendFile(to, filePath,fileName,  text || '' );
      } else {
        await client.sendText(to, text || '');
      }
      results.push({ numero: to, success: true });
    } catch (e) {
      logger.error(`Error enviando a ${num} para ${companyId}: ${e.message}`);
      results.push({ numero: num, success: false, error: e.message });
    }
  }
  return { success: true, results };
}

export async function getStatus(companyId) {
  // Declarar SIEMPRE
  let status = statusByCompany[companyId] || 'NO_SESSION';

  // Si existe el cliente, validar si sigue conectado
  if (clients[companyId]) {
    try {
      const connected = await clients[companyId].isConnected();
      if (!connected) status = 'DISCONNECTED';
    } catch {
      status = 'DISCONNECTED';
    }
  }

  // Si NO existe cliente → intentar restaurarlo
  if (!clients[companyId]) {
    try {
      killOldBrowser(companyId);
      await createClient(companyId);
      status = statusByCompany[companyId];
    } catch (err) {
      return { status, error: err.message };
    }
    return { status };
  }

  // Detectar estados muertos
  const DEAD_STATES = ['browserClose', 'CLOSED', 'DISCONNECTED', 'UNPAIRED_IDLE'];

  if (DEAD_STATES.includes(status)) {
    logger.warn(`[${companyId}] Estado muerto detectado (${status}) → auto-recovery`);
    try {
      killOldBrowser(companyId);
      await createClient(companyId); // intenta reconectar usando tokens guardados
      status = statusByCompany[companyId];
      return { status };
    } catch (err) {
      logger.error(`[${companyId}] Auto-recovery falló: ${err.message}`);
      return { status: 'SCAN_REQUIRED' };
    }
  }

  return { status };
}



export async function logout(companyId) {
  const client = clients[companyId];
  if (!client) return { success: false, msg: 'session not active' };
  try {
    await client.logout();
    delete clients[companyId];
    statusByCompany[companyId] = 'CLOSED';
    return { success: true };
  } catch (e) {
    logger.error(`logout error ${companyId}: ${e.message}`);
    return { success: false, msg: e.message };
  }
}

export async function restoreSessionsOnBoot() {
  const storedSessions = fs.readdirSync(sessionsPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const companyId of storedSessions) {
    try {
      logger.info(`♻ Restaurando sesión ${companyId}...`);
      await createClient(companyId); // reconecta usando tokens existentes
      logger.info(`Sesión restaurada ${companyId}`);
    } catch (e) {
      logger.error(`No se pudo restaurar ${companyId}: ${e.message}`);
    }
  }
}

// Exportar también las variables internas si son necesarias
export default {
  initSession,
  getQR,
  getStatus,
  sendMessage,
  logout,
  restoreSessionsOnBoot,
  clients,
  _internal: { qrByCompany, statusByCompany, reconnectState }
};