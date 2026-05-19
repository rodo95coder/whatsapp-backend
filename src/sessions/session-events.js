// src/sessions/session-events.js

import logger from "../utils/logger.js";
import store from "./session-store.js";
import { setSessionState, setEngineState } from "./session-state.js";
import { scheduleReconnect } from "./reconnect-manager.js";

const CONNECTED_ENGINE_STATES = [
  "CONNECTED",
  "MAIN",
  "NORMAL",
  "inChat",
  "isLogged",
];

const CRITICAL_ENGINE_STATES = [
  "DISCONNECTED",
  "UNPAIRED",
  "browserClose",
  "CLOSED",
];

function isRuntimeValid(runtime, generation) {
  if (!runtime) {
    return false;
  }

  if (runtime.closed) {
    return false;
  }

  if (runtime.destroying) {
    return false;
  }

  if (runtime.generation !== generation) {
    return false;
  }

  return true;
}
export function registerSessionEvents({ client, companyId, generation }) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  if (runtime.listenersRegistered) {
    return;
  }

  runtime.listenersRegistered = true;

  client.onStateChange(async (state) => {
    const currentRuntime = store.getRuntime(companyId);

    if (!isRuntimeValid(currentRuntime, generation)) {
      return;
    }

    logger.info(`[${companyId}] onStateChange => ${state}`);

    setEngineState(companyId, state);

    // =========================
    // CONNECTED
    // =========================
    if (CONNECTED_ENGINE_STATES.includes(state)) {
      currentRuntime.reconnectAttempts = 0;
      currentRuntime.qrAttempts = 0;
      currentRuntime.qr = null;

      setSessionState(companyId, "CONNECTED");

      return;
    }

    // =========================
    // WAITING QR
    // =========================
    if (state === "QR_READY" || state === "notLogged") {
      setSessionState(companyId, "WAITING_QR");

      return;
    }

    // =========================
    // CRITICAL
    // =========================
    if (CRITICAL_ENGINE_STATES.includes(state)) {
      logger.warn(`[${companyId}] Estado crítico detectado: ${state}`);

      setSessionState(companyId, "DISCONNECTED");

      if (!currentRuntime.manualLogout) {
        scheduleReconnect(companyId);
      }
    }
  });

  client.onMessage(() => {
    const currentRuntime = store.getRuntime(companyId);

    if (!isRuntimeValid(currentRuntime, generation)) {
      return;
    }

    currentRuntime.touch();
  });
}
