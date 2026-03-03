// src/services/session.service.js
import wppconnect from '@wppconnect-team/wppconnect';
import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';
import webhookService from './webhook.js';
import config from '../config/env.js';
import { exec } from "child_process";
import { enqueue } from './queue.service.js';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);
const { sessionsPath, puppeteerPath } = config;
fs.ensureDirSync(sessionsPath);

// Reconnection policy
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60000;

const clients = {};      // companyId -> client instance
const qrByCompany = {};  // companyId -> qr base64
const statusByCompany = {};
const reconnectState = {}; // companyId -> { attempts, timerId }
const reconnectTimeouts = {}; // Para controlar los timeouts de reconexión

async function killOldBrowser(companyId) {
  const platform = os.platform();
  logger.info(`[${companyId}] Limpiando procesos en ${platform}...`);

  
  // Eliminar archivos de bloqueo
  const sessionDir = companyFolder(companyId);
  const userDataDir = path.join(sessionDir, companyId);
  
  if (platform === 'win32') {
    try {
      // En Windows, buscar procesos por la carpeta de perfil
      const { stdout } = await execAsync(
        `wmic process where "name='chrome.exe' and commandline like '%${userDataDir}%'" get processid`
      );
      
      const pids = stdout.split('\n')
        .filter(line => /^\d+$/.test(line.trim()))
        .map(line => line.trim());
      
      for (const pid of pids) {
        try {
          await execAsync(`taskkill /PID ${pid} /F`);
          logger.info(`[${companyId}] Proceso Chrome ${pid} terminado`);
        } catch (e) {}
      }
    } catch (e) {}
    
  } else {
    // Linux/Mac: buscar por la carpeta de perfil
    try {
      const { stdout } = await execAsync(
        `ps aux | grep chrome | grep "${userDataDir}" | awk '{print $2}'`
      );
      
      const pids = stdout.split('\n').filter(pid => pid.trim());
      
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          logger.info(`[${companyId}] Proceso Chrome ${pid} terminado`);
        } catch (e) {}
      }
    } catch (e) {}
  }

  // Eliminar archivos de bloqueo  
  const lockFile = path.join(userDataDir, "SingletonLock");
  try { fs.rmSync(lockFile, { force: true }); } catch {}
  
  const crashpad = path.join(userDataDir, "Crashpad");
  try { fs.rmSync(crashpad, { recursive: true, force: true }); } catch {}

  logger.info(`[${companyId}] Browser limpiado y desbloqueado`);
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
  
  if (state.attempts > RECONNECT_MAX_ATTEMPTS) {
    logger.warn(`[${companyId}] Máximo de reintentos alcanzado (${RECONNECT_MAX_ATTEMPTS})`);
    statusByCompany[companyId] = 'RECONNECT_FAILED';
    return;
  }
  
  const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (state.attempts - 1), RECONNECT_MAX_DELAY_MS);
  logger.info(`[${companyId}] Programando reintento en ${delay}ms (intento ${state.attempts}/${RECONNECT_MAX_ATTEMPTS})`);

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
      logger.error(`[${companyId}] Error en reintento ${state.attempts}: ${err.message}`);
      
      if (state.attempts < RECONNECT_MAX_ATTEMPTS) {
        scheduleReconnect(companyId);
      } else {
        logger.warn(`[${companyId}] Máx reintentos alcanzados, marcando como SCAN_REQUIRED`);
        qrByCompany[companyId] = null;
        statusByCompany[companyId] = 'SCAN_REQUIRED';
        
        const wh = readWebhookUrl(companyId);
        if (wh) webhookService.emitWebhook(wh, { 
          event: 'scan_required', 
          companyId,
          reason: 'max_reconnect_attempts'
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
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-dev-shm-usage'
        ]
      },
      catchQR: (base64Qr, asciiQR, attempt, urlCode) => {
        logger.info(`[${companyId}] QR generado (intento ${attempt})`);
        qrByCompany[companyId] = base64Qr;
        statusByCompany[companyId] = 'SCAN_PENDING';
        
        const wh = readWebhookUrl(companyId);
        if (wh) webhookService.emitWebhook(wh, { 
          event: 'qr', 
          companyId, 
          qr: base64Qr,
          attempt
        });
      },
      statusFind: (statusSession) => {
        logger.info(`[${companyId}] statusFind: ${statusSession}`);
        statusByCompany[companyId] = statusSession;
        
        const wh = readWebhookUrl(companyId);
        if (wh) webhookService.emitWebhook(wh, { 
          event: 'status', 
          companyId, 
          status: statusSession 
        });
      },
      logQR: false
    });

    // Configurar manejador de onMessage
    try {
      client.onMessage((msg) => {
        logger.info(`[${companyId}] Mensaje recibido de ${msg.from}: ${msg.body?.substring(0, 30)}...`);
        const wh = readWebhookUrl(companyId);
        if (wh) webhookService.emitWebhook(wh, { 
          event: 'message', 
          companyId, 
          msg 
        });
      });
    } catch (e) {
      logger.warn(`[${companyId}] client.onMessage no disponible: ${e.message}`);
    }

    // Configurar manejador de cambios de estado (MEJORADO)
    try {
      client.onStateChange(async (state) => {
        logger.info(`[${companyId}] onStateChange: ${state}`);
        
        const previousState = statusByCompany[companyId];
        statusByCompany[companyId] = state;

        // NO RECONECTAR SI ESTAMOS EN PROCESO DE LOGOUT
        if (state === 'UNPAIRED' || state === 'browserClose') {
    // Verificar si hay un logout en progreso
    const isLoggingOut = logoutInProgress[companyId];
    if (isLoggingOut) {
      logger.info(`[${companyId}] Logout en progreso, ignorando reconexión automática`);
      return;
    }
    }

        // ===== MANEJO AUTOMÁTICO DE BROWSErCLOSE Y ESTADOS CRÍTICOS =====
        const criticalStates = ['browserClose', 'CLOSED', 'DISCONNECTED', 'UNPAIRED', 'TIMEOUT'];
        
        if (criticalStates.includes(state)) {
          logger.warn(`[${companyId}] Estado crítico detectado: ${state}. Iniciando reconexión...`);
          
          // Limpiar cliente actual
          if (clients[companyId]) {
            try {
              await clients[companyId].close();
            } catch {}
            delete clients[companyId];
          }
          
          // Cancelar cualquier timeout existente
          if (reconnectTimeouts[companyId]) {
            clearTimeout(reconnectTimeouts[companyId]);
          }
          
          // Esperar un momento y reintentar
          reconnectTimeouts[companyId] = setTimeout(async () => {
            try {
              logger.info(`[${companyId}] Ejecutando reconexión automática por estado: ${state}`);
              await createClient(companyId);
            } catch (error) {
              logger.error(`[${companyId}] Error en reconexión automática: ${error.message}`);
              // Si falla, programar reintentos progresivos
              scheduleReconnect(companyId);
            } finally {
              delete reconnectTimeouts[companyId];
            }
          }, 3000); // Esperar 3 segundos antes de reconectar
          
          return;
        }

        // Manejo de estados de conexión normal
        if (state === 'CONNECTED' || state === 'inChat' || state === 'isLogged') {
          logger.info(`[${companyId}] Sesión conectada exitosamente`);
          // Limpiar cualquier estado de reconexión
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
            event: 'state_change', 
            companyId, 
            previousState,
            currentState: state
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
        statusByCompany[companyId] = 'CONNECTED';
        logger.info(`[${companyId}] Cliente conectado inicialmente`);
      }
    } catch (e) {}

    logger.info(`[${companyId}] Cliente creado exitosamente`);
    return client;

  } catch (error) {
    logger.error(`[${companyId}] Error creando cliente: ${error.message}`);
    statusByCompany[companyId] = 'ERROR';
    throw error;
  }
}

export async function initSession(companyId) {
  if (!companyId) throw new Error('companyId required');
  
  const cleanId = companyId.trim();
  ensureCompanyFolder(cleanId);

  // Si ya existe cliente activo, no reiniciar
  if (clients[cleanId] && statusByCompany[cleanId] !== 'browserClose') {
    logger.info(`[${cleanId}] Sesión ya existe y está activa`);
    return { success: true, msg: 'already active' };
  }
  
  // Si está en estado crítico, forzar recreación
  if (statusByCompany[cleanId] === 'browserClose' || statusByCompany[cleanId] === 'ERROR') {
    logger.info(`[${cleanId}] Estado crítico detectado, recreando cliente...`);
    if (clients[cleanId]) {
      try {
        await clients[cleanId].close();
      } catch {}
      delete clients[cleanId];
    }
  }
  
  // Marcar estado inicial
  statusByCompany[cleanId] = 'INITIALIZING';

  // Lanzar proceso en background
  createClient(cleanId)
    .then(() => {
      logger.info(`[${cleanId}] Inicialización completada`);
    })
    .catch((err) => {
      logger.error(`[${cleanId}] Error creando cliente: ${err.message}`);
      statusByCompany[cleanId] = 'ERROR';
    });

  return { success: true, msg: 'initialization started' };
}

export function getQR(companyId) {
  const s = statusByCompany[companyId];
  if (!['SCAN_PENDING', 'SCAN_REQUIRED', 'notLogged'].includes(s)) return null;
  return qrByCompany[companyId] || null;
}

export async function sendMessage({ companyId, numbers, text, filePath, fileName }) {
  return new Promise((resolve, reject) => {
    enqueue(companyId, async () => {
      try {
        const client = clients[companyId];

        if (!client) {
          return reject(new Error("Session not active"));
        }

        // Verificar que la sesión está realmente conectada
        const status = statusByCompany[companyId];
        const connectedStates = ['CONNECTED', 'inChat', 'isLogged', 'NORMAL', 'MAIN'];
        
        if (!connectedStates.includes(status)) {
          return reject(new Error(`Session not connected (status: ${status})`));
        }

        const results = [];

        for (const number of numbers) {
          logger.info(`[${companyId}] Enviando mensaje a ${number}`);
          
          let response;
          if (filePath) {
            // Enviar con archivo
            response = await client.sendFileMessage(number, filePath, fileName || 'file', text);
          } else {
            // Solo texto
            response = await client.sendText(number, text);
          }
          
          results.push({ 
            number, 
            success: true, 
            response 
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
  const status = statusByCompany[companyId] || 'NO_SESSION';
  
  // Mapeo de estados
  const statusMap = {
    'inChat': 'CONNECTED',
    'isLogged': 'CONNECTED',
    'NORMAL': 'CONNECTED',
    'MAIN': 'CONNECTED',
    'CONNECTED': 'CONNECTED',
    'SYNCING': 'CONNECTING',
    'SCAN_PENDING': 'PENDING_QR',
    'SCAN_REQUIRED': 'PENDING_QR',
    'notLogged': 'PENDING_QR',
    'browserClose': 'DISCONNECTED',
    'DISCONNECTED': 'DISCONNECTED',
    'CLOSED': 'DISCONNECTED',
    'ERROR': 'ERROR'
  };
  
  return statusMap[status] || status;
}


// src/services/session.service.js
/* export async function logout(companyId) {
  console.log(`[${companyId}] Iniciando proceso de logout...`);
  
  const client = clients[companyId];
  const status = statusByCompany[companyId];
  
  console.log(`[${companyId}] Estado actual:`, status);
  console.log(`[${companyId}] Cliente existe:`, !!client);
  
  // Verificar que la sesión existe
  if (!clients.hasOwnProperty(companyId) && !statusByCompany.hasOwnProperty(companyId)) {
    return { 
      success: false, 
      msg: `No existe sesión activa para ${companyId}` 
    };
  }

  // Caso 1: Sesión con QR pendiente (no hay cliente real)
  if (!client && (status === 'notLogged' || status === 'SCAN_PENDING')) {
    // Solo limpiar datos
    delete qrByCompany[companyId];
    delete statusByCompany[companyId];
    delete reconnectState[companyId];
    logger.info(`[${companyId}] Sesión pendiente de QR eliminada`);
    return { success: true, msg: 'Sesión pendiente eliminada' };
  }

  // Caso 2: Hay cliente, intentar logout real
  if (client) {
    try {
      // Verificar que el cliente tiene métodos necesarios
      if (typeof client.logout !== 'function') {
        throw new Error('Cliente no tiene método logout');
      }
      
      await client.logout();
      logger.info(`[${companyId}] Logout exitoso`);
      
    } catch (e) {
      logger.error(`[${companyId}] Error en logout: ${e.message}`);
      
      // Si el error es de contexto destruido, igual limpiamos
      if (e.message.includes('Execution context was destroyed')) {
        logger.info(`[${companyId}] Contexto destruido, limpiando manualmente`);
        // Continuar con la limpieza
      } else {
        return { success: false, msg: e.message };
      }
    }
  }

  // Siempre limpiar los datos de la sesión
  delete clients[companyId];
  delete qrByCompany[companyId];
  delete statusByCompany[companyId];
  delete reconnectState[companyId];
  
  if (reconnectTimeouts && reconnectTimeouts[companyId]) {
    clearTimeout(reconnectTimeouts[companyId]);
    delete reconnectTimeouts[companyId];
  }
  
  logger.info(`[${companyId}] Recursos liberados`);
  return { success: true, msg: 'Sesión cerrada' };
} */
// src/services/session.service.js
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
  if (!clients.hasOwnProperty(companyId) && !statusByCompany.hasOwnProperty(companyId)) {
    return { 
      success: false, 
      msg: `No existe sesión activa para ${companyId}` 
    };
  }

  // Caso 1: Sesión con QR pendiente
  if (!client && (status === 'notLogged' || status === 'SCAN_PENDING')) {
    delete qrByCompany[companyId];
    delete statusByCompany[companyId];
    logger.info(`[${companyId}] Sesión pendiente de QR eliminada`);
    return { success: true, msg: 'Sesión pendiente eliminada' };
  }

  // Caso 2: Hay cliente, intentar logout real
  if (client) {
    try {
      // IMPORTANTE: Desactivar manejadores de eventos antes de logout
      if (client.removeAllListeners) {
        client.removeAllListeners('stateChange');
        client.removeAllListeners('message');
      }
      
      await client.logout();
      logger.info(`[${companyId}] Logout exitoso`);
      
    } catch (e) {
      logger.error(`[${companyId}] Error en logout: ${e.message}`);
      
      if (e.message.includes('Execution context was destroyed')) {
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
        logger.warn(`[${companyId}] Error al cerrar navegador: ${closeError.message}`);
      }
    }
  }

  // Limpiar TODOS los datos de la sesión
  delete clients[companyId];
  delete qrByCompany[companyId];
  delete statusByCompany[companyId];
  
  logger.info(`[${companyId}] Recursos liberados completamente`);
  return { success: true, msg: 'Sesión cerrada' };
}


export async function restoreSessionsOnBoot() {
  if (!fs.existsSync(sessionsPath)) return;
  
  const storedSessions = fs.readdirSync(sessionsPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => {
      // Filtrar carpetas inválidas
      if (!name || name.trim() === '') return false;
      if (name === 'component_crx_cache' || name === 'Crashpad' || name === 'Default') return false;
      if (name.startsWith('System Profile')) return false;
      return true;
    });

  logger.info(`♻ Restaurando ${storedSessions.length} sesiones...`);

  for (const companyId of storedSessions) {
    try {
      logger.info(`[${companyId}] Restaurando...`);
      await createClient(companyId);
      logger.info(`[${companyId}] Restaurada exitosamente`);
    } catch (e) {
      logger.error(`[${companyId}] Error restaurando: ${e.message}`);
    }
  }
}

// Limpieza periódica de sesiones
setInterval(() => {
  for (const [companyId, status] of Object.entries(statusByCompany)) {
    // Limpiar sesiones desconectadas por más de 1 hora
    if (status === 'DISCONNECTED' || status === 'CLOSED' || status === 'RECONNECT_FAILED') {
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
}, 1000 * 60 * 60); // Cada hora

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