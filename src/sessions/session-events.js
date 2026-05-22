// src/sessions/session-events.js

import fs from "fs-extra";
import path from "path";

import logger from "../utils/logger.js";
import config from "../config/env.js";

import store from "./session-store.js";
import { scheduleReconnect } from "./reconnect-manager.js";
import { setSessionState } from "./session-state.js";

function sessionReadyFile(companyId) {
  return path.join(config.sessionsPath, companyId, "session-ready.json");
}

async function markSessionReady(companyId) {
  await fs.ensureDir(path.join(config.sessionsPath, companyId));

  await fs.writeJson(
    sessionReadyFile(companyId),
    {
      companyId,
      connectedAt: new Date().toISOString(),
    },
    { spaces: 2 },
  );
}

export function registerSessionEvents({ client, companyId }) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  client.onStateChange(async (state) => {
    const currentRuntime = store.getRuntime(companyId);
    if (!currentRuntime) {
      return;
    }

    logger.info(`[${companyId}] onStateChange => ${state}`);

    currentRuntime.engineState = state;

    switch (state) {
      case "CONNECTED":
      case "MAIN":
      case "NORMAL":
      case "inChat":
      case "isLogged":
        currentRuntime.reconnectAttempts = 0;
        currentRuntime.qr = null;
        currentRuntime.qrAttempts = 0;

        await markSessionReady(companyId);
        setSessionState(companyId, "CONNECTED");
        break;

      case "QR_READY":
      case "notLogged":
        setSessionState(companyId, "WAITING_QR");
        break;

      case "DISCONNECTED":
      case "UNPAIRED":
      case "browserClose":
      case "CLOSED":
        setSessionState(companyId, "DISCONNECTED");

        if (!currentRuntime.manualLogout) {
          scheduleReconnect(companyId);
        }

        break;
    }
  });

  client.onMessage(() => {
    const currentRuntime = store.getRuntime(companyId);
    if (!currentRuntime) {
      return;
    }
    currentRuntime.touch();
  });
}
