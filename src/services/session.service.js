// src/services/session.service.js
import wppconnect from "@wppconnect-team/wppconnect";
import fs from "fs-extra";
import path from "path";
import logger from "../utils/logger.js";
import webhookService from "./webhook.js";
import config from "../config/env.js";
import { exec, execSync } from "child_process";
import { enqueueMessage, getQueueSize } from "../core/message-queue.js";
import { withTimeout } from "../utils/timeout.js";
import { setTimeout as sleep } from "timers/promises";
import os from "os";

const { sessionsPath, puppeteerPath } = config;

// ===== CONFIG =====
const MAX_SESSIONS = 5;
const SESSION_LOCK_TTL = 15000; // 15 segundos

const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60000;

// ===== STATE =====
const clients = {}; // companyId -> client instance
const qrByCompany = {}; // companyId -> qr base64
const statusByCompany = {};
const creatingClients = new Set();
const qrAttempts = {}; //  Para contar intentos de QR
const reconnectState = {}; // companyId -> { attempts, timerId }
const sessionLocks = new Map(); // evita múltiples inits
const statusMeta = {};

// ===== HELPERS =====
const CONNECTED_STATES = ["CONNECTED", "inChat", "isLogged", "MAIN", "NORMAL"];
const CRITICAL_STATES = ["DISCONNECTED", "CLOSED", "UNPAIRED", "browserClose"];

function companyFolder(companyId) {
  return path.join(sessionsPath, String(companyId));
}

function ensureCompanyFolder(companyId) {
  const f = companyFolder(companyId);
  fs.ensureDirSync(f);
  return f;
}

function updateStatus(companyId, status) {
  statusByCompany[companyId] = status;
  statusMeta[companyId] = { status, lastUpdate: Date.now() };
}

function readWebhookUrl(companyId) {
  try {
    const cfg = fs.readJsonSync(
      path.join(companyFolder(companyId), "webhook.json"),
      { throws: false },
    );
    return cfg?.url || null;
  } catch {
    return null;
  }
}

function clearSessionMemory(companyId) {
  delete clients[companyId];
  delete qrByCompany[companyId];
  delete statusByCompany[companyId];
  delete statusMeta[companyId];
  delete reconnectState[companyId];
}
async function safeCloseClient(companyId) {
  try {
    const client = clients[companyId];
    if (!client) return;

    if (client) {
      if (!["QR_FAILED", "ERROR"].includes(statusByCompany[companyId])) {
        updateStatus(companyId, "DISCONNECTED");
      }

      logger.info(`[${companyId}] Cerrando cliente de forma segura...`);
      // remover eventos para evitar loops
      client.removeAllListeners?.();

      try {
        await client.close();
      } catch {}
      logger.info(`[${companyId}] Cliente cerrado correctamente`);
    }
  } catch (err) {
    logger.warn(`[${companyId}] Error cerrando cliente: ${err.message}`);
  } finally {
    delete clients[companyId];
    creatingClients.delete(companyId);
  }
}
async function killOldBrowser(companyId) {
  const platform = os.platform();
  const hadClient = !!clients[companyId];
  await safeCloseClient(companyId);

  const userDataDir = companyFolder(companyId);

  try {
    // eliminar locks
    // const lockFile = path.join(userDataDir, "SingletonLock");
    // if (fs.existsSync(lockFile)) fs.rmSync(lockFile, { force: true });
    // // crashpad
    // const crashpad = path.join(userDataDir, "Crashpad");
    // if (fs.existsSync(crashpad)) {
    //   fs.rmSync(crashpad, { recursive: true, force: true });
    // }
    // matar procesos zombie
    // solo limpieza de locks locales
    // if (os.platform() === "win32") {
    //   execSync(`taskkill /F /IM chrome.exe /T`, { stdio: "ignore" });
    // } else {
    //   execSync(`pkill -9 -f chrome`, { stdio: "ignore" });
    //   execSync(`pkill -9 -f chromium`, { stdio: "ignore" });
    // }
  } catch (err) {
    logger.warn(`[${companyId}] killOldBrowser error: ${err.message}`);
  }
  if (hadClient) {
    await sleep(2000);
  }
}
async function forceCleanSession(companyId) {
  try {
    logger.warn(`[${companyId}] Limpieza de sesión`);
    const status = statusByCompany[companyId];
    const sessionDir = companyFolder(companyId);

    await safeCloseClient(companyId);
    await sleep(2000); // clave para evitar EBUSY

    if (["QR_FAILED", "AUTH_FAILURE"].includes(status)) {
      try {
        fs.removeSync(sessionDir);
        logger.info(
          `[${companyId}] Carpeta de sesión eliminada por estado crítico`,
        );
      } catch {}
    }

    delete clients[companyId];
    delete statusByCompany[companyId];
    delete qrByCompany[companyId];
    delete qrAttempts[companyId];
    delete reconnectState[companyId];
    delete statusMeta[companyId];

    logger.info(`[${companyId}] Sesión limpia`);
  } catch (err) {
    creatingClients.delete(companyId);
    logger.error(`[${companyId}] Error limpieza: ${err.message}`);
  } finally {
    creatingClients.delete(companyId);
  }
}
function scheduleReconnect(companyId) {
  if (reconnectState[companyId]?.timerId) return;
  if (creatingClients.has(companyId)) return;

  const state = (reconnectState[companyId] ||= {
    attempts: 0,
    timerId: null,
  });

  state.lastAttempt = Date.now();
  state.attempts++;

  if (state.attempts > RECONNECT_MAX_ATTEMPTS) {
    logger.warn(
      `[${companyId}] Máximo de reintentos alcanzado (${RECONNECT_MAX_ATTEMPTS})`,
    );
    updateStatus(companyId, "RECONNECT_FAILED");
    return;
  }

  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** (state.attempts - 1),
    RECONNECT_MAX_DELAY_MS,
  );
  logger.info(
    `[${companyId}] Programando reintento en ${delay}ms (intento ${state.attempts}/${RECONNECT_MAX_ATTEMPTS})`,
  );

  if (state.timerId) clearTimeout(state.timerId);

  state.timerId = setTimeout(async () => {
    state.timerId = null;
    try {
      logger.info(`[${companyId}] Ejecutando reintento ${state.attempts}...`);

      // Limpiar cliente actual si existe
      if (clients[companyId]) {
        try {
          await clients[companyId].close();
        } catch {}
        delete clients[companyId];
      }

      const success = await createClient(companyId)
        .then(() => true)
        .catch(() => false);

      if (success) {
        delete reconnectState[companyId];
      }
    } catch (err) {
      logger.error(
        `[${companyId}] Error en reintento ${state.attempts}: ${err.message}`,
      );

      if (state.attempts < RECONNECT_MAX_ATTEMPTS) {
        scheduleReconnect(companyId);
      } else {
        logger.warn(
          `[${companyId}] Máx reintentos alcanzados, marcando como SCAN_REQUIRED`,
        );
        qrByCompany[companyId] = null;
        updateStatus(companyId, "SCAN_REQUIRED");

        const wh = readWebhookUrl(companyId);
        if (wh)
          webhookService.emitWebhook(wh, {
            event: "scan_required",
            companyId,
            reason: "max_reconnect_attempts",
          });
      }
    }
  }, delay);
}
async function createClient(companyId, { isRestore = false } = {}) {
  if (creatingClients.has(companyId)) {
    logger.warn(`[${companyId}] createClient ya en progreso`);
    return false;
  }
  creatingClients.add(companyId);

  // ===== BLOQUEOS =====
  if (clients[companyId]) {
    logger.warn(`[${companyId}] Cliente ya existe`);
    creatingClients.delete(companyId);
    return false;
  }

  if (reconnectState[companyId]?.timerId) return false;

  if (statusByCompany[companyId] === "QR_FAILED") {
    logger.warn(`[${companyId}] Bloqueado por QR_FAILED`);
    creatingClients.delete(companyId);
    return false;
  }

  ensureCompanyFolder(companyId);
  if (!isRestore) {
    await killOldBrowser(companyId);
  }

  logger.info(`[${companyId}] Creando cliente...`);

  try {
    const client = await withTimeout(
      wppconnect.create({
        session: String(companyId),
        folderNameToken: sessionsPath,
        headless: true,
        updatesLog: false,
        autoClose: 141000, // 3 minutos

        puppeteerOptions: {
          executablePath: puppeteerPath,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
          ],
        },

        catchQR: (base64Qr, asciiQR, attempt) => {
          qrAttempts[companyId] = attempt;
          const MAX_QR_ATTEMPTS = 5;

          if (statusByCompany[companyId] === "QR_FAILED") return;

          if (attempt > MAX_QR_ATTEMPTS) {
            logger.error(`[${companyId}] QR_FAILED`);
            updateStatus(companyId, "QR_FAILED");
            qrByCompany[companyId] = null;
            forceCleanSession(companyId);
            return;
          }

          logger.info(`[${companyId}] QR intento ${attempt}`);
          qrByCompany[companyId] = base64Qr;
          updateStatus(companyId, "SCAN_PENDING");

          const wh = readWebhookUrl(companyId);
          if (wh) {
            webhookService.emitWebhook(wh, {
              event: "qr",
              companyId,
              qr: base64Qr,
              attempt,
            });
          }
        },
        statusFind: (status) => {
          if (statusByCompany[companyId] === "QR_FAILED") return;
          logger.info(`[${companyId}] status: ${status}`);
          updateStatus(companyId, status);
        },
        logQR: false,
      }),
      180000,
    );
    // ===== EVENTOS =====

    client.onStateChange(async (state) => {
      if (statusByCompany[companyId] === "QR_FAILED") return;
      logger.info(`[${companyId}] state: ${state}`);

      const previousState = statusByCompany[companyId];
      updateStatus(companyId, state);

      const connectedStates = ["CONNECTED", "inChat", "isLogged"];

      if (connectedStates.includes(state)) {
        let hostNumber = null;

        try {
          const wid = await client.getWid();
          hostNumber = wid?.user || null;
        } catch {}
        logger.info(`[${companyId}] Número conectado: ${hostNumber}`);
        logger.info(`[${companyId}] CONECTADO`);
        delete reconnectState[companyId];
        return;
      }

      const criticalStates = [
        "DISCONNECTED",
        "CLOSED",
        "browserClose",
        "UNPAIRED",
      ];

      if (criticalStates.includes(state)) {
        logger.warn(`[${companyId}] Estado crítico: ${state}`);
        await safeCloseClient(companyId);
        scheduleReconnect(companyId);
        return;
      }

      // webhook estado
      const wh = readWebhookUrl(companyId);
      if (wh && previousState !== state) {
        webhookService.emitWebhook(wh, {
          event: "state_change",
          companyId,
          previousState,
          currentState: state,
        });
      }
    });

    client.onMessage((msg) => {
      if (statusByCompany[companyId] === "QR_FAILED") return;

      logger.info(`[${companyId}] Msg de ${msg.from}`);

      const wh = readWebhookUrl(companyId);
      if (wh) {
        webhookService.emitWebhook(wh, {
          event: "message",
          companyId,
          msg,
        });
      }
    });

    clients[companyId] = client;
    logger.info(`[${companyId}] Cliente listo`);
    return true;
  } catch (error) {
    if (statusByCompany[companyId] === "INITIALIZING") {
      logger.warn(`[${companyId}] Ya inicializando`);
      creatingClients.delete(companyId);
      return;
    }
    logger.error(`[${companyId}] Error creando cliente: ${error.message}`);
    await safeCloseClient(companyId);
    updateStatus(companyId, "ERROR");
    delete clients[companyId];
    throw error;
  } finally {
    sessionLocks.delete(companyId);
    creatingClients.delete(companyId);
  }
}

export async function initSession(companyId) {
  if (!companyId) throw new Error("companyId required");

  const cleanId = companyId.trim();
  const currentStatus = statusByCompany[cleanId];
  const now = Date.now();

  if (creatingClients.has(cleanId)) {
    return { success: false, msg: "Already initializing" };
  }

  // ===== LOCK =====
  const lockTime = sessionLocks.get(cleanId);

  if (lockTime && now - lockTime < SESSION_LOCK_TTL) {
    logger.warn(`[${cleanId}] Lock activo`);
    return { success: false, msg: "Session is initializing, try later" };
  }

  sessionLocks.set(cleanId, now);

  const activeSessions = Object.values(statusByCompany).filter((s) =>
    ["CONNECTED", "inChat", "isLogged", "INITIALIZING"].includes(s),
  );

  try {
    //  SI ESTADO ACTIVO → RETORNAR
    if (
      clients[cleanId] &&
      !["browserClose", "ERROR", "QR_FAILED"].includes(currentStatus)
    ) {
      logger.info(`[${cleanId}] Sesión ya activa`);
      return { success: true, msg: "already active" };
    }
    // ===== BLOQUEO POR QR FALLIDO =====
    if (currentStatus === "QR_FAILED") {
      logger.warn(`[${cleanId}] Limpiando por QR_FAILED`);
      await forceCleanSession(cleanId);
    }
    // ===== SI ESTADO CRÍTICO → LIMPIAR =====
    if (["browserClose", "ERROR"].includes(currentStatus)) {
      logger.warn(`[${cleanId}] Estado crítico, cerrando cliente`);
      await safeCloseClient(cleanId);
    }
    // ===== LIMITE DE SESIONES =====
    if (Object.keys(clients).length >= MAX_SESSIONS) {
      throw new Error("Max sessions reached");
    }

    if (activeSessions.length >= MAX_SESSIONS) {
      throw new Error("Max active sessions reached");
    }
    updateStatus(cleanId, "INITIALIZING");
    // ===== CREAR CLIENTE =====
    createClient(cleanId).catch((err) => {
      logger.error(`[${cleanId}] Error init: ${err.message}`);
      updateStatus(cleanId, "ERROR");
    });

    return { success: true, msg: "initializing" };
  } finally {
    setTimeout(() => sessionLocks.delete(cleanId), SESSION_LOCK_TTL);
  }
}

export function getQR(companyId) {
  const s = statusByCompany[companyId];
  if (!["SCAN_PENDING", "SCAN_REQUIRED", "notLogged"].includes(s)) return null;
  return qrByCompany[companyId] || null;
}

export async function sendMessage({
  companyId,
  numbers,
  text,
  filePath,
  fileName,
}) {
  if (getQueueSize(companyId) > 1000) {
    throw new Error("Queue overloaded, try later");
  }
  return enqueueMessage(companyId, async () => {
    const client = clients[companyId];

    if (!client) {
      throw new Error("Session not active");
    }

    const status = statusByCompany[companyId];

    const connectedStates = [
      "CONNECTED",
      "inChat",
      "isLogged",
      "NORMAL",
      "MAIN",
    ];

    if (!connectedStates.includes(status)) {
      throw new Error(`Session not connected (status: ${status})`);
    }
    if (reconnectState[companyId]?.timerId || creatingClients.has(companyId)) {
      throw new Error("Session reconnecting, try later");
    }

    const results = [];

    for (const number of numbers) {
      try {
        logger.info(`[${companyId}] Enviando mensaje a ${number}`);

        let response;

        if (filePath) {
          response = await withTimeout(
            client.sendFile(number, filePath, fileName || "file", text),
            15000,
          );
        } else {
          response = await withTimeout(client.sendText(number, text), 15000);
        }

        results.push({
          number,
          success: true,
          response,
        });
      } catch (err) {
        logger.error(
          `[${companyId}] Error enviando a ${number}: ${err.message}`,
        );

        results.push({
          number,
          success: false,
          error: err.message,
        });
      }
    }

    return { success: true, results };
  });
}

export function getStatus(companyId) {
  const status = statusByCompany[companyId] || "NO_SESSION";

  // Mapeo de estados
  const statusMap = {
    inChat: "CONNECTED",
    isLogged: "CONNECTED",
    NORMAL: "CONNECTED",
    MAIN: "CONNECTED",
    CONNECTED: "CONNECTED",
    SYNCING: "CONNECTING",
    SCAN_PENDING: "PENDING_QR",
    SCAN_REQUIRED: "PENDING_QR",
    notLogged: "PENDING_QR",
    browserClose: "DISCONNECTED",
    DISCONNECTED: "DISCONNECTED",
    CLOSED: "DISCONNECTED",
    ERROR: "ERROR",
  };

  return statusMap[status] || status;
}

export async function logout(companyId, { full = false } = {}) {
  logger.info(`[${companyId}] Iniciando proceso de logout...`);

  const client = clients[companyId];
  const status = statusByCompany[companyId];

  logger.info(`[${companyId}] Estado actual:`, status);
  logger.info(`[${companyId}] Cliente existe:`, !!client);

  // DESACTIVAR RECONEXIÓN AUTOMÁTICA ANTES DE HACER LOGOUT
  if (reconnectState[companyId]) {
    if (reconnectState[companyId].timerId) {
      clearTimeout(reconnectState[companyId].timerId);
    }
    delete reconnectState[companyId];
  }

  // Verificar que la sesión existe
  if (
    !clients.hasOwnProperty(companyId) &&
    !statusByCompany.hasOwnProperty(companyId)
  ) {
    return {
      success: false,
      msg: `No existe sesión activa para ${companyId}`,
    };
  }

  // Caso 1: Sesión con QR pendiente
  if (!client && (status === "notLogged" || status === "SCAN_PENDING")) {
    delete qrByCompany[companyId];
    delete statusByCompany[companyId];
    delete statusMeta[companyId];
    delete qrAttempts[companyId];
    logger.info(`[${companyId}] Sesión pendiente de QR eliminada`);
    return { success: true, msg: "Sesión pendiente eliminada" };
  }

  // Caso 2: Hay cliente, intentar logout real
  if (client) {
    try {
      // IMPORTANTE: Desactivar manejadores de eventos antes de logout
      if (client.removeAllListeners) {
        client.removeAllListeners("stateChange");
        client.removeAllListeners("message");
      }

      await client.logout();
      logger.info(`[${companyId}] Logout exitoso`);
    } catch (e) {
      logger.error(`[${companyId}] Error en logout: ${e.message}`);

      if (e.message.includes("Execution context was destroyed")) {
        logger.info(`[${companyId}] Contexto destruido, limpiando manualmente`);
      } else {
        return { success: false, msg: e.message };
      }
    } finally {
      // Cerrar el navegador completamente
      try {
        if (client.close) {
          await client.close();
        }
      } catch (closeError) {
        logger.warn(
          `[${companyId}] Error al cerrar navegador: ${closeError.message}`,
        );
      }
    }
  }

  // Limpiar TODOS los datos de la sesión
  delete clients[companyId];
  delete qrByCompany[companyId];
  delete statusByCompany[companyId];
  delete qrAttempts[companyId];
  delete statusMeta[companyId];
  if (full) {
    await fs.remove(companyFolder(companyId));
  }

  logger.info(`[${companyId}] Recursos liberados completamente`);
  return { success: true, msg: "Sesión cerrada" };
}

export async function restoreSessionsOnBoot() {
  if (!fs.existsSync(sessionsPath)) return;

  try {
    if (process.env.NODE_ENV === "production") {
      exec("pkill -f chrome");
      exec("pkill -f chromium");
    }
    logger.info("Procesos Chrome eliminados al iniciar");
  } catch (e) {}

  // Leer carpetas de sesión
  const allFolders = fs
    .readdirSync(sessionsPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  // Filtrar carpetas válidas
  const validSessions = allFolders.filter((name) => {
    if (!name || name.trim() === "") return false;
    if (
      name === "component_crx_cache" ||
      name === "Crashpad" ||
      name === "Default"
    )
      return false;
    if (name.startsWith("System Profile")) return false;
    return true;
  });

  logger.info(`Restaurando ${validSessions.length} sesiones...`);

  for (const companyId of validSessions) {
    const sessionFolder = path.join(sessionsPath, companyId);
    const hasTokens =
      fs.existsSync(path.join(sessionFolder, "Default")) ||
      fs.existsSync(path.join(sessionFolder, "session.data"));

    // Si no hay tokens válidos, eliminar
    if (!hasTokens) {
      logger.info(`[${companyId}] Carpeta sin tokens, eliminando...`);
      try {
        fs.removeSync(sessionFolder);
      } catch (e) {}
      continue;
    }

    // Intentar restaurar la sesión
    try {
      logger.info(`[${companyId}] Restaurando...`);

      const success = await createClient(companyId, { isRestore: true });

      if (!success) {
        throw new Error("No se pudo crear cliente");
      }

      await sleep(5000);

      const client = clients[companyId];

      if (!client) throw new Error("Cliente no disponible");

      let retries = 0;
      let state = null;

      while (retries < 10) {
        await sleep(2000);
        state = await client.getConnectionState();

        if (["CONNECTED", "MAIN", "inChat"].includes(state)) break;

        retries++;
      }

      if (!["CONNECTED", "inChat", "isLogged", "MAIN"].includes(state)) {
        updateStatus(companyId, "SCAN_REQUIRED");
      }

      logger.info(`[${companyId}] Restaurada correctamente`);
    } catch (e) {
      logger.error(`[${companyId}] Error restaurando: ${e.message}`);

      try {
        fs.removeSync(sessionFolder);
      } catch {}
    }
  }
}

export function isSessionHealthy(companyId) {
  const healthyStates = ["CONNECTED", "inChat", "isLogged"];
  return (
    clients[companyId] && healthyStates.includes(statusByCompany[companyId])
  );
}
// Limpieza periódica de sesiones
setInterval(
  () => {
    for (const [companyId, status] of Object.entries(statusByCompany)) {
      const lastUpdate = statusMeta[companyId]?.lastUpdate || Date.now();
      // Limpiar sesiones desconectadas por más de 1 hora
      if (
        ["DISCONNECTED", "CLOSED", "RECONNECT_FAILED"].includes(status) &&
        Date.now() - lastUpdate > 60 * 60 * 1000
      ) {
        logger.info(`[${companyId}] Limpiando sesión inactiva (${status})`);

        if (clients[companyId]) {
          try {
            clients[companyId].close();
          } catch {}
          delete clients[companyId];
        }

        delete qrByCompany[companyId];
        delete statusByCompany[companyId];
        delete statusMeta[companyId];
        delete reconnectState[companyId];
      }
    }
  },
  1000 * 60 * 60,
); // Cada hora

export default {
  initSession,
  getQR,
  getStatus,
  sendMessage,
  logout,
  restoreSessionsOnBoot,
  clients,
  _internal: { qrByCompany, updateStatus, reconnectState },
};
