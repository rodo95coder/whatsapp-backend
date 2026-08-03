// src/sessions/session-events.js

import fs from "fs-extra";
import path from "path";

import logger from "../utils/logger.js";
import config from "../config/env.js";

import store from "./session-store.js";
import { scheduleReconnect } from "./reconnect-manager.js";
import { setSessionState } from "./session-state.js";
import { updateMessageAck } from "../services/message/message-tracker.js";
import { readWebhookUrl } from "./session-files.js";
import { emitWebhook } from "../services/webhook.js";

function sessionReadyFile(companyId) {
  return path.join(config.sessionsPath, companyId, "session-ready.json");
}

function normalizeEngineState(value) {
  return String(value || "").trim().replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
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

export function registerSessionEvents({ client, companyId, runtime: expectedRuntime, generationId }) {
  const runtime = store.getRuntime(companyId);

  if (!runtime || runtime !== expectedRuntime || !runtime.isCurrentGeneration(generationId)) {
    return;
  }

  client.onStateChange(async (state) => {
    const currentRuntime = store.getRuntime(companyId);
    if (!currentRuntime || currentRuntime !== expectedRuntime || !currentRuntime.isCurrentGeneration(generationId)) {
      return;
    }

    const normalizedState = normalizeEngineState(state);
    logger.info(`[${companyId}] onStateChange => ${normalizedState}`);

    currentRuntime.engineState = state;

    switch (normalizedState) {
      case "CONNECTED":
      case "MAIN":
      case "NORMAL":
      case "IN_CHAT":
      case "IS_LOGGED":
        currentRuntime.reconnectAttempts = 0;
        currentRuntime.qr = null;
        currentRuntime.qrAttempts = 0;

        await markSessionReady(companyId);
        setSessionState(companyId, "CONNECTED", { runtime: currentRuntime, generationId });
        break;

      case "QR_READY":
      case "NOT_LOGGED":
        setSessionState(companyId, "QR_REQUIRED", { runtime: currentRuntime, generationId });
        break;

      case "DISCONNECTED":
      case "UNPAIRED":
      case "BROWSER_CLOSE":
      case "CLOSED":
        setSessionState(companyId, "DISCONNECTED", { runtime: currentRuntime, generationId, reason: "ENGINE_DISCONNECTED" });

        if (!currentRuntime.manualLogout) {
          scheduleReconnect(companyId, { runtime: currentRuntime, generationId });
        }

        break;
    }
  });

  client.onMessage(() => {
    const currentRuntime = store.getRuntime(companyId);
    if (!currentRuntime || currentRuntime !== expectedRuntime || !currentRuntime.isCurrentGeneration(generationId)) {
      return;
    }
    currentRuntime.touch();
  });

  client.onAck?.(async (ack) => {
    const currentRuntime = store.getRuntime(companyId);
    if (!currentRuntime || currentRuntime !== expectedRuntime || !currentRuntime.isCurrentGeneration(generationId)) return;

    const message = updateMessageAck(currentRuntime, ack);
    if (!message) return;

    logger.info(`[${companyId}] message.ack id=${message.messageId} status=${message.status}`);
    const webhookUrl = readWebhookUrl(companyId);
    if (webhookUrl) {
      await emitWebhook(webhookUrl, {
        event: "message.ack",
        companyId,
        messageId: message.messageId,
        to: message.to,
        status: message.status,
        timestamp: new Date(message.updatedAt).toISOString(),
      });
    }
  });
}
