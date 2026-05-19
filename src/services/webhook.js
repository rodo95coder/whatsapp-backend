// services/webhook.js
import axios from 'axios';
import logger from '../utils/logger.js';
import config from '../config/env.js';

const { webhookTimeoutMs } = config;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export async function emitWebhook(webhookUrl, payload) {
  if (!webhookUrl) return;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      await axios.post(webhookUrl, payload, {
        timeout: webhookTimeoutMs
      });

      logger.info(`Webhook OK ${payload.event}`);
      return;

    } catch (e) {
      logger.warn(`Webhook intento ${i + 1} fallido`);

      if (i === MAX_RETRIES - 1) {
        logger.error(`Webhook falló definitivamente`);
      }

      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }
}

export default {
  emitWebhook
};