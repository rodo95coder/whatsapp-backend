// src/services/message/message-sender.js

import path from "path";

import store from "../../sessions/session-store.js";
import config from "../../config/env.js";
import { withTimeout } from "../../utils/timeout.js";
import {
  enqueueSessionOperation,
  getQueueSize,
} from "../../core/session-operation-queue.js";
import { mapAckStatus, trackMessage } from "./message-tracker.js";

const { maxQueuePerSession, sendMessageTimeoutMs } = config;

function normalizeNumber(number) {
  const value = String(number);

  if (value.endsWith("@c.us") || value.endsWith("@lid")) {
    return value;
  }

  const digits = value.replace(/\D/g, "");

  return `${digits}@c.us`;
}

function sanitizeSendResponse(response) {
  if (!response) {
    return null;
  }

  const ack = response.transportResult === "OK" && Number(response.ack) < 1
    ? 1
    : response.ack;

  return {
    messageId: response.id?._serialized || response.id || null,
    to: response.to || response.chatId || null,
    from: response.from || null,
    status: mapAckStatus(ack),
    type: response.type || null,
    timestamp: response.t || response.timestamp || null,
  };
}

async function sendTextDirectly(client, chatId, text) {
  const page = await client.page;

  return withTimeout(
    page.evaluate(
      async ({ targetChatId, content }) => {
        const result = await globalThis.WPP.chat.sendTextMessage(targetChatId, content, {
          waitForAck: true,
        });
        const transport = await result.sendMsgResult;

        if (transport?.messageSendResult !== "OK") {
          throw new Error(`WPP transport failed: ${transport?.messageSendResult || "UNKNOWN"}`);
        }

        // Return only serializable fields. WPPConnect's client.sendText()
        // attempts a second legacy WAPI lookup here, which can fail after a
        // successful send when WhatsApp Web changes its internal stores.
        return {
          id: result.id,
          to: result.to,
          from: result.from,
          ack: result.ack,
          transportResult: transport.messageSendResult,
          timestamp: Date.now(),
        };
      },
      { targetChatId: chatId, content: text || "" },
    ),
    sendMessageTimeoutMs,
    "sendText timeout",
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

  return sendTextDirectly(client, chatId, text);
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
            deliveryConfirmed: false,
            retryRecommended: false,
            warning: "WPPConnect returned empty response",
          });

          continue;
        }

        results.push({
          number,
          success: true,
          ...sanitized,
          deliveryConfirmed: ["delivered", "read", "played"].includes(sanitized.status),
        });
        trackMessage(runtime, sanitized);
      } catch (error) {
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
