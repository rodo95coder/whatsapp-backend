// src/services/session.service.js
import wppconnect from "@wppconnect-team/wppconnect";
import fs from "fs-extra";
import path from "path";
import logger from "../utils/logger.js";
import webhookService from "./webhook.js";
import config from "../config/env.js";
import { exec,execSync } from "child_process";
import { setTimeout } from 'timers/promises';
import { enqueue } from "./queue.service.js";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);
const qrBlocked = {};
const { sessionsPath, puppeteerPath } = config;
fs.ensureDirSync(sessionsPath);

// Reconnection policy
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60000;

const clients = {}; // companyId -> client instance
const qrByCompany = {}; // companyId -> qr base64
const statusByCompany = {};
const reconnectState = {}; // companyId -> { attempts, timerId }
const reconnectTimeouts = {}; // Para controlar los timeouts de reconexión
const qrAttempts = {}; //  Para contar intentos de QR
const logoutInProgress = {}; //  Para controlar logout

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
    const cfgPath = path.join(companyFolder(companyId), "webhook.json");
    const obj = fs.readJsonSync(cfgPath, { throws: false });
    return obj && obj.url ? obj.url : null;
  } catch (e) {
    return null;
  }
}

async function killOldBrowser(companyId) {
  const platform = os.platform();
  logger.info(`[${companyId}] Limpiando procesos en ${platform}...`);

  const sessionDir = companyFolder(companyId);
  const userDataDir = path.join(sessionDir, companyId);

  // ===== 1. MATAR PROCESOS DE CHROME =====
  forceKillChromeProcesses(companyId);

  // ===== 2. ELIMINAR ARCHIVOS DE BLOQUEO =====
  const lockFile = path.join(userDataDir, "SingletonLock");
  try {
    if (fs.existsSync(lockFile)) {
      fs.rmSync(lockFile, { force: true });
      logger.info(`[${companyId}] Archivo de bloqueo eliminado`);
    }
  } catch {}

  const crashpad = path.join(userDataDir, "Crashpad");
  try {
    if (fs.existsSync(crashpad)) {
      fs.rmSync(crashpad, { recursive: true, force: true });
      logger.info(`[${companyId}] Carpeta Crashpad eliminada`);
    }
  } catch {}

  // ===== 3. ESPERAR UN MOMENTO =====
  await setTimeout(2000);

  logger.info(`[${companyId}] Browser limpiado y desbloqueado`);
}

async function forceKillChromeProcesses(companyId) {
  const platform = os.platform();
  const sessionFolder = companyFolder(companyId);
  const userDataDir = path.join(sessionFolder, companyId);
  
  logger.info(`[${companyId}] TERMINANDO PROCESOS DE CHROME ...`);
  
  if (platform === "win32") {
    // Buscar TODOS los procesos Chrome relacionados
    try {
      // Usar taskkill con filtro por nombre de ventana (funciona en Windows)
      execSync(`taskkill /F /FI "WINDOWTITLE eq *${companyId}*"`, { stdio: 'ignore' });
      
      // También matar por imagen (todos los chrome, pero filtramos después)
      execSync(`taskkill /F /IM chrome.exe`, { stdio: 'ignore' });
      
      logger.info(`[${companyId}] Procesos Chrome terminados en Windows`);
    } catch (e) {}
    
  } else {
    // Linux
    try {
      execSync(`pkill -f "${userDataDir}"`, { stdio: 'ignore' });
      execSync(`pkill -f "${companyId}"`, { stdio: 'ignore' });
      execSync(`pkill -f chrome`, { stdio: 'ignore' });
    } catch (e) {}
  }  
}
async function forceCleanSession(companyId) {
  logger.info(`[${companyId}] LIMPIEZA FORZADA INICIADA (MODO EXTREMO)`);
  
  const platform = os.platform();
  const sessionFolder = companyFolder(companyId);
  const userDataDir = path.join(sessionFolder, companyId);
  
  // ===== 1. CERRAR CLIENTE DE WPPCONNECT =====
  if (clients[companyId]) {
    try {
      // Intentar cerrar gracefulmente
      await clients[companyId].close().catch(() => {});
      
      // Si tiene puppeteer, matar el proceso directamente
      if (clients[companyId].puppeteer?.process()?.pid) {
        const pid = clients[companyId].puppeteer.process().pid;
        try {
          if (platform === "win32") {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          } else {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
          }
          logger.info(`[${companyId}] Proceso ${pid} terminado`);
        } catch (e) {}
      }
    } catch (e) {}
    delete clients[companyId];
  }
  
  // ===== 2. MATAR TODOS LOS PROCESOS RELACIONADOS =====
  logger.info(`[${companyId}] MATANDO TODOS LOS PROCESOS...`);
  
  const processNames = ['chrome', 'chromium', 'chrome.exe', 'chromium.exe'];
  
  if (platform === "win32") {
    // En Windows, matar por:
    // - Nombre de proceso
    // - Carpeta de perfil
    // - Puerto (si supieramos el puerto)
    // - Título de ventana
    
    for (const proc of processNames) {
      try {
        execSync(`taskkill /F /IM ${proc} /T`, { stdio: 'ignore' }); // /T mata procesos hijos
      } catch (e) {}
    }
    
    // Matar por carpeta de perfil (más específico)
    try {
      execSync(`wmic process where "name='chrome.exe' and commandline like '%${userDataDir}%'" delete`, 
        { stdio: 'ignore' });
    } catch (e) {}
    
    // Matar por nombre de sesión
    try {
      execSync(`taskkill /F /FI "WINDOWTITLE eq *${companyId}*"`, { stdio: 'ignore' });
    } catch (e) {}
    
  } else {
    // Linux
    try {
      execSync(`pkill -9 -f "${userDataDir}"`, { stdio: 'ignore' });
      execSync(`pkill -9 -f "${companyId}"`, { stdio: 'ignore' });
      execSync(`pkill -9 chrome`, { stdio: 'ignore' });
      execSync(`pkill -9 chromium`, { stdio: 'ignore' });
    } catch (e) {}
  }
  
  // ===== 3. ESPERAR QUE LOS PROCESOS MUERAN =====
  logger.info(`[${companyId}] Esperando que los procesos terminen...`);
  await setTimeout(5000); // Esperar 5 segundos
  
  // ===== 4. INTENTAR ELIMINAR CARPETA CON MÁS FUERZA =====
  logger.info(`[${companyId}] INTENTANDO ELIMINAR CARPETA...`);
  
  let carpetaEliminada = false;
  for (let i = 0; i < 10; i++) { // Aumentado a 10 intentos
    try {
      if (fs.existsSync(sessionFolder)) {
        // En Windows, a veces ayuda cambiar permisos antes de eliminar
        if (platform === "win32") {
          try {
            execSync(`attrib -R -S -H "${sessionFolder}\\*" /S /D`, { stdio: 'ignore' });
          } catch (e) {}
        }
        
        fs.removeSync(sessionFolder);
        logger.info(`[${companyId}] Carpeta eliminada en intento ${i+1}`);
        carpetaEliminada = true;
        break;
      } else {
        carpetaEliminada = true;
        break;
      }
    } catch (e) {
      logger.warn(`[${companyId}] Error eliminando carpeta (intento ${i+1}): ${e.message}`);
      
      // Si el error es EBUSY, matar procesos más agresivamente
      if (e.message.includes('EBUSY')) {
        try {
          if (platform === "win32") {
            // Buscar procesos que tengan archivos abiertos en la carpeta
            execSync(`taskkill /F /IM chrome.exe /T`, { stdio: 'ignore' });
            execSync(`taskkill /F /IM chromium.exe /T`, { stdio: 'ignore' });
          }
        } catch (err) {}
      }
      
      if (i < 9) await setTimeout(3000);
    }
  }
  
  if (!carpetaEliminada) {
    logger.error(`[${companyId}] NO SE PUDO ELIMINAR LA CARPETA DESPUÉS DE 10 INTENTOS`);
    // Último recurso: renombrar la carpeta para que no interfiera
    try {
      const backupFolder = `${sessionFolder}_backup_${Date.now()}`;
      fs.renameSync(sessionFolder, backupFolder);
      logger.info(`[${companyId}] Carpeta renombrada a ${path.basename(backupFolder)}`);
    } catch (e) {}
  }
  
  // ===== 5. RESETEAR ESTADOS =====
  delete statusByCompany[companyId];
  delete qrByCompany[companyId];
  if (qrAttempts) delete qrAttempts[companyId];
  delete reconnectState[companyId];
  delete qrBlocked[companyId];
  
  if (reconnectTimeouts[companyId]) {
    clearTimeout(reconnectTimeouts[companyId]);
    delete reconnectTimeouts[companyId];
  }
  
  logger.info(`[${companyId}] LIMPIEZA FORZADA COMPLETADA ${carpetaEliminada ? '' : ''}`);
}
function scheduleReconnect(companyId) {
  reconnectState[companyId] = reconnectState[companyId] || {
    attempts: 0,
    timerId: null,
  };
  const state = reconnectState[companyId];
  state.attempts += 1;

  if (state.attempts > RECONNECT_MAX_ATTEMPTS) {
    logger.warn(
      `[${companyId}] Máximo de reintentos alcanzado (${RECONNECT_MAX_ATTEMPTS})`,
    );
    statusByCompany[companyId] = "RECONNECT_FAILED";
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
    try {
      logger.info(`[${companyId}] Ejecutando reintento ${state.attempts}...`);

      // Limpiar cliente actual si existe
      if (clients[companyId]) {
        try {
          await clients[companyId].close();
        } catch {}
        delete clients[companyId];
      }

      // Intentar recrear cliente
      await createClient(companyId);

      // Resetear contador si funciona
      delete reconnectState[companyId];
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
        statusByCompany[companyId] = "SCAN_REQUIRED";

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

async function createClient(companyId) {
  ensureCompanyFolder(companyId);
  logger.info(`[${companyId}] Creando WPPConnect client...`);

  // Limpiar cualquier cliente existente
  if (clients[companyId]) {
    try {
      await clients[companyId].close();
    } catch {}
    delete clients[companyId];
  }

  await killOldBrowser(companyId);

  try {
    const client = await wppconnect.create({
      session: String(companyId),
      folderNameToken: companyFolder(companyId),
      autoClose: false,
      headless: true,
      useChrome: false,
      puppeteerOptions: {
        executablePath: puppeteerPath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
          "--disable-dev-shm-usage",
        ],
      },
      catchQR: (base64Qr, asciiQR, attempt, urlCode) => {
        const MAX_QR_ATTEMPTS = 5;
        
        //  VALIDACIÓN
        if (attempt > MAX_QR_ATTEMPTS || statusByCompany[companyId] === "QR_FAILED") {
          
          // Si es la primera vez que detectamos el exceso, hacer limpieza
          if (!qrBlocked[companyId] && attempt > MAX_QR_ATTEMPTS) {
            qrBlocked[companyId] = true;
            
            logger.error(`[${companyId}] LÍMITE DE QR EXCEDIDO (${MAX_QR_ATTEMPTS}) - DETENIENDO`);

            // 1. Marcar como fallido
            statusByCompany[companyId] = "QR_FAILED";
            qrByCompany[companyId] = null;

            // 2. Forzar cierre del proceso del navegador
            try {
              if (clients[companyId] && clients[companyId].puppeteer?.process()?.pid) {
                const pid = clients[companyId].puppeteer.process().pid;
                execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                logger.info(`[${companyId}] Proceso ${pid} terminado por límite de QR`);
              }
            } catch (e) {}

            // 3. Lanzar limpieza asíncrona (no esperar)
            forceCleanSession(companyId).catch(() => {});
          }
          
          return;
        }
        
        // QR normal (dentro del límite)
        qrAttempts[companyId] = attempt;
        logger.info(`[${companyId}] QR generado (intento ${attempt}/${MAX_QR_ATTEMPTS})`);
        qrByCompany[companyId] = base64Qr;
        statusByCompany[companyId] = "SCAN_PENDING";

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
      statusFind: (statusSession) => {
        // NO actualizar estado si ya está en QR_FAILED
        if (statusByCompany[companyId] === "QR_FAILED") {
          return;
        }
        logger.info(`[${companyId}] statusFind: ${statusSession}`);
        statusByCompany[companyId] = statusSession;

        const wh = readWebhookUrl(companyId);
        if (wh) {
          webhookService.emitWebhook(wh, {
            event: "status",
            companyId,
            status: statusSession,
          });
        }
      },
      logQR: false,
    });

    // Configurar manejador de onMessage
    try {
      client.onMessage((msg) => {
        if (statusByCompany[companyId] === "QR_FAILED") return;
        logger.info(
          `[${companyId}] Mensaje recibido de ${msg.from}: ${msg.body?.substring(0, 30)}...`,
        );
        const wh = readWebhookUrl(companyId);
        if (wh) {
          webhookService.emitWebhook(wh, {
            event: "message",
            companyId,
            msg,
          });
        }
      });
    } catch (e) {
      logger.warn(`[${companyId}] client.onMessage no disponible: ${e.message}`);
    }

    // Configurar manejador de cambios de estado
    try {
      client.onStateChange(async (state) => {
        if (statusByCompany[companyId] === "QR_FAILED") {
          logger.info(`[${companyId}] Estado ignorado (QR_FAILED): ${state}`);
          return;
        }
        logger.info(`[${companyId}] onStateChange: ${state}`);

        const previousState = statusByCompany[companyId];
        statusByCompany[companyId] = state;

        // NO RECONECTAR SI ESTAMOS EN PROCESO DE LOGOUT
        if (state === "UNPAIRED" || state === "browserClose") {
          const isLoggingOut = logoutInProgress[companyId];
          if (isLoggingOut) {
            logger.info(`[${companyId}] Logout en progreso, ignorando reconexión automática`);
            return;
          }
        }

        // ===== MANEJO AUTOMÁTICO DE ESTADOS CRÍTICOS =====
        const criticalStates = [
          "browserClose",
          "CLOSED",
          "DISCONNECTED",
          "UNPAIRED",
          "TIMEOUT",
        ];

        if (criticalStates.includes(state)) {
          logger.warn(`[${companyId}] Estado crítico detectado: ${state}. Iniciando reconexión...`);

          // Limpiar cliente actual
          if (clients[companyId]) {
            try {
              await clients[companyId].close();
            } catch {}
            delete clients[companyId];
          }

          if (reconnectTimeouts[companyId]) {
            clearTimeout(reconnectTimeouts[companyId]);
          }
          
          reconnectTimeouts[companyId] = setTimeout(async () => {
            try {
              logger.info(`[${companyId}] Ejecutando reconexión automática por estado: ${state}`);
              await createClient(companyId);
            } catch (error) {
              logger.error(`[${companyId}] Error en reconexión automática: ${error.message}`);
              scheduleReconnect(companyId);
            } finally {
              delete reconnectTimeouts[companyId];
            }
          }, 3000);

          return;
        }

        // Manejo de estados de conexión normal
        if (state === "CONNECTED" || state === "inChat" || state === "isLogged") {
          logger.info(`[${companyId}] Sesión conectada exitosamente`);
          delete reconnectState[companyId];
          if (reconnectTimeouts[companyId]) {
            clearTimeout(reconnectTimeouts[companyId]);
            delete reconnectTimeouts[companyId];
          }
        }

        // Webhook para cambios de estado
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
    } catch (e) {
      logger.warn(`[${companyId}] onStateChange no disponible: ${e.message}`);
    }

    clients[companyId] = client;

    // Verificar conexión inicial
    try {
      const isConnected = await client.isConnected();
      if (isConnected) {
        statusByCompany[companyId] = "CONNECTED";
        logger.info(`[${companyId}] Cliente conectado inicialmente`);
      }
    } catch (e) {}

    logger.info(`[${companyId}] Cliente creado exitosamente`);
    return client;
    
  } catch (error) { 
    logger.error(`[${companyId}] Error creando cliente: ${error.message}`);
    statusByCompany[companyId] = "ERROR";
    throw error;
  }
}

export async function initSession(companyId) {
  if (!companyId) throw new Error("companyId required");

  const cleanId = companyId.trim();

  // SI ESTÁ EN QR_FAILED, LIMPIAR TODO ANTES DE REINICIAR
  if (statusByCompany[cleanId] === "QR_FAILED") {
    logger.info(`[${cleanId}] Sesión en QR_FAILED, reiniciando...`);
    await forceCleanSession(cleanId);
  }
  ensureCompanyFolder(cleanId);

     // Si ya existe cliente activo, no reiniciar
  if (
    clients[cleanId] &&
    statusByCompany[cleanId] !== "browserClose" &&
    statusByCompany[cleanId] !== "QR_FAILED"
  ) {
    logger.info(`[${cleanId}] Sesión ya existe y está activa`);
    return { success: true, msg: "already active" };
  }
  // Si está en estado crítico, forzar recreación
  if (
    statusByCompany[cleanId] === "browserClose" ||
    statusByCompany[cleanId] === "ERROR"
  ) {
    logger.info(`[${cleanId}] Estado crítico detectado, recreando cliente...`);
    if (clients[cleanId]) {
      try {
        await clients[cleanId].close();
      } catch {}
      delete clients[cleanId];
    }
    
    // Limpieza adicional para estados críticos
    await forceCleanSession(cleanId);
  }

    // Marcar estado inicial
  statusByCompany[cleanId] = "INITIALIZING";

  // Lanzar proceso en background
  createClient(cleanId)
    .then(() => {
      logger.info(`[${cleanId}] Inicialización completada`);
    })
    .catch((err) => {
      logger.error(`[${cleanId}] Error creando cliente: ${err.message}`);
      statusByCompany[cleanId] = "ERROR";
    });

  return { success: true, msg: "initialization started" };
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
  return new Promise((resolve, reject) => {
    enqueue(companyId, async () => {
      try {
        const client = clients[companyId];

        if (!client) {
          return reject(new Error("Session not active"));
        }

        // Verificar que la sesión está realmente conectada
        const status = statusByCompany[companyId];
        const connectedStates = [
          "CONNECTED",
          "inChat",
          "isLogged",
          "NORMAL",
          "MAIN",
        ];

        if (!connectedStates.includes(status)) {
          return reject(new Error(`Session not connected (status: ${status})`));
        }

        const results = [];

        for (const number of numbers) {
          logger.info(`[${companyId}] Enviando mensaje a ${number}`);

          let response;
          if (filePath) {
            // Enviar con archivo
            response = await client.sendFile(
              number,
              filePath,
              fileName || "file",
              text,
            );
          } else {
            // Solo texto
            response = await client.sendText(number, text);
          }

          results.push({
            number,
            success: true,
            response,
          });
        }

        resolve({ success: true, results });
      } catch (err) {
        logger.error(`[${companyId}] Error en sendMessage: ${err.message}`);
        reject(err);
      }
    });
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

export async function logout(companyId) {
  console.log(`[${companyId}] Iniciando proceso de logout...`);

  const client = clients[companyId];
  const status = statusByCompany[companyId];

  console.log(`[${companyId}] Estado actual:`, status);
  console.log(`[${companyId}] Cliente existe:`, !!client);

  // DESACTIVAR RECONEXIÓN AUTOMÁTICA ANTES DE HACER LOGOUT
  if (reconnectState[companyId]) {
    if (reconnectState[companyId].timerId) {
      clearTimeout(reconnectState[companyId].timerId);
    }
    delete reconnectState[companyId];
  }

  if (reconnectTimeouts[companyId]) {
    clearTimeout(reconnectTimeouts[companyId]);
    delete reconnectTimeouts[companyId];
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

  logger.info(`[${companyId}] Recursos liberados completamente`);
  return { success: true, msg: "Sesión cerrada" };
}

export async function restoreSessionsOnBoot() {
  if (!fs.existsSync(sessionsPath)) return;

  try {
    exec("pkill -f chrome");
    exec("pkill -f chromium");
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
      await createClient(companyId);
      logger.info(`[${companyId}] Restaurada exitosamente`);
    } catch (e) {
      logger.error(`[${companyId}] Error restaurando: ${e.message}`);
      // Si falla, eliminar la carpeta corrupta
      try {
        fs.removeSync(sessionFolder);
        logger.info(`[${companyId}] Carpeta eliminada por error`);
      } catch (err) {}
    }
  }
}

// Limpieza periódica de sesiones
setInterval(
  () => {
    for (const [companyId, status] of Object.entries(statusByCompany)) {
      // Limpiar sesiones desconectadas por más de 1 hora
      if (
        status === "DISCONNECTED" ||
        status === "CLOSED" ||
        status === "RECONNECT_FAILED"
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
        delete reconnectState[companyId];

        if (reconnectTimeouts[companyId]) {
          clearTimeout(reconnectTimeouts[companyId]);
          delete reconnectTimeouts[companyId];
        }
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
  _internal: { qrByCompany, statusByCompany, reconnectState },
};
