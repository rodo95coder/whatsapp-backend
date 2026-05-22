// src/sessions/reconnect-manager.js

import logger from "../utils/logger.js";
import store from "./session-store.js";
import { createClient } from "./client-factory.js";
import { setSessionState } from "./session-state.js";

const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60000;

export function scheduleReconnect(companyId) {
  const runtime = store.getRuntime(companyId);
  if (!runtime) {
    return;
  }
  if (runtime.shutdown.hardStopped) return;

  if (runtime.shutdown?.inProgress) {
    return;
  }

  if (runtime.creating) {
    return;
  }

  if (runtime.manualLogout) {
    return;
  }

  if (runtime.reconnectTimer) {
    return;
  }

  runtime.reconnectAttempts++;

  if (runtime.reconnectAttempts > RECONNECT_MAX_ATTEMPTS) {
    logger.warn(`[${companyId}] Máximo reconnect alcanzado`);

    setSessionState(companyId, "FAILED");

    return;
  }

  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** (runtime.reconnectAttempts - 1),
    RECONNECT_MAX_DELAY_MS,
  );

  logger.warn(`[${companyId}] Reconnect en ${delay}ms`);

  setSessionState(companyId, "RECONNECTING");

  runtime.reconnectTimer = setTimeout(async () => {
    runtime.reconnectTimer = null;

    const currentRuntime = store.getRuntime(companyId);

    if (!currentRuntime) {
      return;
    }

    if (currentRuntime.shutdown.hardStopped) {
      return;
    }

    if (currentRuntime.shutdown.destroying) {
      return;
    }

    if (currentRuntime.manualLogout) {
      return;
    }

    try {
      const success = await createClient(companyId);

      if (!success) {
        if (!runtime.shutdown?.inProgress) scheduleReconnect(companyId);
      }
    } catch (err) {
      logger.error(`[${companyId}] Error reconnect: ${err.message}`);

      if (!runtime.shutdown?.inProgress) scheduleReconnect(companyId);
    }
  }, delay);
}
