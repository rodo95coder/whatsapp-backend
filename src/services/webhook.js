/**
 * webhook.service.js
 * Emitir llamados HTTP POST hacia el cliente (opcional)
 */

import axios from 'axios';
import logger from '../utils/logger.js';
import config from '../config/env.js';
const { webhookTimeoutMs } = config;


export async function emitWebhook(webhookUrl, payload) {
  if (!webhookUrl) return;
  try {
    await axios.post(webhookUrl, payload, {
      timeout: webhookTimeoutMs,
      headers: { "Content-Type": "application/json" }
    });
    logger.info(`Webhook emitido a ${webhookUrl} evento ${payload.event}`);
  } catch (e) {
    logger.error(`Error webhook ${webhookUrl}: ${e.message}`);
  }
}

export default {
  emitWebhook
};
