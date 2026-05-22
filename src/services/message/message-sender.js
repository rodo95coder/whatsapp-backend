// src/services/message/message-sender.js

import path from "path";

import store from "../../sessions/session-store.js";
import config from "../../config/env.js";
import { withTimeout } from "../../utils/timeout.js";
import {
  enqueueSessionOperation,
  getQueueSize,
} from "../../core/session-operation-queue.js";

const { maxQueuePerSession, sendMessageTimeoutMs } = config;

function normalizeNumber(number) {
  const value = String(number);

  if (value.endsWith("@c.us") || value.endsWith("@lid")) {
    return value;
  }

  const digits = value.replace(/\D/g, "");

  return `${digits}@c.us`;
}

function mapAckStatus(ack) {
  const map = {
    "-1": "error",
    0: "pending",
    1: "server",
    2: "delivered",
    3: "read",
    4: "played",
    5: "played",
  };

  return map[String(ack)] || "unknown";
}

function sanitizeSendResponse(response) {
  if (!response) {
    return null;
  }

  return {
    messageId: response.id?._serialized || response.id || null,
    to: response.to || response.chatId || null,
    from: response.from || null,
    status: mapAckStatus(response.ack),
    type: response.type || null,
    timestamp: response.t || response.timestamp || null,
  };
}

function isWppSoftSendError(error) {
  const message = error?.message || String(error);

  return (
    message.includes("msgChunks") ||
    message.includes("Cannot read properties of undefined")
  );
}

async function sendSingleMessage({ client, number, text, filePath, fileName }) {
  const chatId = normalizeNumber(number);

  if (filePath) {
    return withTimeout(
      client.sendFile(
        chatId,
        filePath,
        fileName || path.basename(filePath),
        text || "",
      ),
      sendMessageTimeoutMs,
      "sendFile timeout",
    );
  }

  return withTimeout(
    client.sendText(chatId, text || ""),
    sendMessageTimeoutMs,
    "sendText timeout",
  );
}

function validateSendPayload({ numbers, text, filePath }) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw new Error("numbers debe ser un array con al menos un número");
  }

  if (!text && !filePath) {
    throw new Error("Debe proporcionar text o filePath");
  }
}

function validateRuntime(companyId) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    throw new Error("Session not found");
  }

  if (!runtime.client) {
    throw new Error("Session not initialized");
  }

  if (runtime.creating) {
    throw new Error("Session initializing");
  }

  if (runtime.destroying) {
    throw new Error("Session destroying");
  }

  if (runtime.state !== "CONNECTED") {
    throw new Error(`Session not connected (state: ${runtime.state})`);
  }

  return runtime;
}

export async function sendMessage({
  companyId,
  numbers,
  text,
  filePath,
  fileName,
}) {
  validateSendPayload({
    numbers,
    text,
    filePath,
  });

  if (getQueueSize(companyId) > maxQueuePerSession) {
    throw new Error("Queue overloaded");
  }

  return enqueueSessionOperation(companyId, async () => {
    const runtime = validateRuntime(companyId);
    const client = runtime.client;
    const results = [];

    for (const number of numbers) {
      try {
        const response = await sendSingleMessage({
          client,
          number,
          text,
          filePath,
          fileName,
        });

        const sanitized = sanitizeSendResponse(response);

        if (!sanitized) {
          results.push({
            number,
            success: true,
            status: "sent_unconfirmed",
            warning: "WPPConnect returned empty response",
          });

          continue;
        }

        results.push({
          number,
          success: true,
          ...sanitized,
        });
      } catch (error) {
        if (isWppSoftSendError(error)) {
          results.push({
            number,
            success: true,
            status: "sent_unconfirmed",
            warning: error.message,
          });

          continue;
        }

        results.push({
          number,
          success: false,
          error: error.message,
        });
      }
    }

    runtime.touch();

    const successful = results.filter((item) => item.success).length;
    const failed = results.length - successful;

    return {
      success: true,
      summary: {
        total: results.length,
        successful,
        failed,
      },
      results,
    };
  });
}
