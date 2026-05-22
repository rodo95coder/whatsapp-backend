import store from "./session-store.js";
import logger from "../utils/logger.js";
import { setSessionState } from "./session-state.js";
import { safeCloseClient } from "./session-lifecycle.js";

/**
 * SESSION SHUTDOWN v2
 */
export async function shutdownSession(companyId, options = {}) {
  const {
    reason = "UNKNOWN",
    deleteFolder = false,
    force = false,
    clearQr = true,
  } = options;
  const runtime = store.getRuntime(companyId);
  if (!runtime) return;

  if (runtime.shutdown.inProgress && !force) {
    logger.warn(`[${companyId}] Shutdown ignorado: already in progress`);
    return;
  }

  logger.warn(`[${companyId}] SHUTDOWN v2 (${reason})`);

  try {
    /**
     * =========================
     * 1. HARD STOP FLAG (CLAVE)
     * =========================
     */
    runtime.shutdown.inProgress = true;
    runtime.shutdown.completed = false;
    runtime.shutdown.reason = reason;
    runtime.shutdown.startedAt = Date.now();

    runtime.manualLogout = reason === "LOGOUT";

    /**
     * =========================
     * 2. STOP STATES
     * =========================
     */
    setSessionState(companyId, "STOPPING");

    /**
     * =========================
     * 3. CANCEL RECONNECT
     * =========================
     */
    if (runtime.reconnectTimer) {
      clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
    }

    /**
     * =========================
     * 4. ABORT CONTEXT
     * =========================
     */
    try {
      runtime.abortController?.abort();
    } catch {}

    /**
     * =========================
     * 5. STOP WA-JS LOOP SAFELY
     * =========================
     * IMPORTANTE: primero cortar referencia global
     */
    await safeCloseClient(companyId);
    runtime.client = null;
    runtime.browser = null;
    runtime.creating = false;
    runtime.initialized = false;
    runtime.listenersRegistered = false;
    /**
     * =========================
     * 7. CLEAN SESSION FOLDER (BEST EFFORT)
     * =========================
     */
    if (deleteFolder) {
      const { removeSessionFolder } = await import("./session-lifecycle.js");

      await removeSessionFolder(companyId);
    }

    /**
     * =========================
     * 8. FINAL STATE
     * =========================
     */
    if (clearQr) {
      runtime.qr = null;
      runtime.shutdown.qrExpired = false;
      runtime.lastQr = null;
      runtime.qrAttempts = 0;
      runtime.lastQrAt = null;
    }
    setSessionState(companyId, "IDLE");
  } finally {
    runtime.shutdown.inProgress = false;
    runtime.shutdown.completed = true;
    runtime.shutdown.finishedAt = Date.now();

    runtime.creating = false;
    runtime.initialized = false;
    runtime.listenersRegistered = false;

    runtime.abortController = null;

    const shouldDestroyRuntime =
      reason === "QR_FAILED" || reason === "AUTO_CLOSE" || reason === "FORCE";

    if (shouldDestroyRuntime) {
      const { removeRuntime } = await import("./session-store.js");

      removeRuntime(companyId);

      logger.warn(`[${companyId}] Runtime destruido`);
    }
  }
}

/**
 * FORCE STOP (usa logout / emergencias)
 */
export async function forceShutdownSession(companyId, options = {}) {
  return shutdownSession(companyId, {
    ...options,
    force: true,
    reason: options.reason || "FORCE",
  });
}
