import PQueue from "p-queue";

import config from "../config/env.js";
import logger from "../utils/logger.js";
import { emitWebhook } from "./webhook.js";

const queue = new PQueue({ concurrency: Math.max(1, config.webhookConcurrency) });

export function enqueueWebhook(webhookUrl, payload) {
  if (!webhookUrl) return;

  queue.add(() => emitWebhook(webhookUrl, payload)).catch((error) => {
    logger.error(`Webhook queue error: ${error.message}`);
  });
}

export function getWebhookQueueStats() {
  return { pending: queue.pending, waiting: queue.size };
}
