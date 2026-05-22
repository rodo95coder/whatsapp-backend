// src/services/webhook.js

import axios from "axios";
import logger from "../utils/logger.js";
import config from "../config/env.js";

const { webhookTimeoutMs } = config;

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export async function emitWebhook(webhookUrl, payload) {
  if (!webhookUrl || !isValidHttpUrl(webhookUrl)) {
    return;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await axios.post(webhookUrl, payload, {
        timeout: webhookTimeoutMs,
      });

      logger.info(`Webhook OK ${payload?.event || "unknown"}`);
      return true;
    } catch (err) {
      logger.warn(`Webhook intento ${attempt} fallido: ${err.message}`);

      if (attempt === MAX_RETRIES) {
        logger.error("Webhook falló definitivamente");
        return false;
      }

      await delay(RETRY_DELAY);
    }
  }

  return false;
}

export default {
  emitWebhook,
};
