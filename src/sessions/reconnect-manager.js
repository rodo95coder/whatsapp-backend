//src/sessions/reconnect-manager.js
import logger from "../utils/logger.js";
import store from "./session-store.js";
import { createClient } from "./client-factory.js";
import { setSessionState } from "./session-state.js";
import { destroyClient } from "./session-lifecycle.js";
import { enqueueSessionOperation } from "../core/session-operation-queue.js";

const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60000;

export function scheduleReconnect(companyId) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  if (runtime.state === "CONNECTED") {
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
    const currentRuntime = store.getRuntime(companyId);

    if (!currentRuntime) {
      return;
    }

    currentRuntime.reconnectTimer = null;

    if (currentRuntime.state === "CONNECTED") {
      return;
    }

    try {
      await enqueueSessionOperation(companyId, async () => {
        await destroyClient(companyId);
        await createClient(companyId);
      });
    } catch (err) {
      logger.error(`[${companyId}] Error reconnect: ${err.message}`);

      scheduleReconnect(companyId);
    }
  }, delay);
}
