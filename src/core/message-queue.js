// src/core/message-queue.js
import logger from '../utils/logger.js';
const queues = {};

const DEFAULT_DELAY = 800;
const MAX_QUEUE_SIZE = 5000; // protección anti memory leak

function getQueue(companyId) {
  if (!queues[companyId]) {
    queues[companyId] = {
      queue: [],
      processing: false
    };
  }
  return queues[companyId];
}

export function enqueueMessage(companyId, handler) {
  const q = getQueue(companyId);

  if (q.queue.length >= MAX_QUEUE_SIZE) {
    return Promise.reject(new Error('Queue overflow - too many messages'));
  }

  return new Promise((resolve, reject) => {
    q.queue.push({
      handler,
      resolve,
      reject,
        retries: 0
    });

    if (!q.processing) {
      processQueue(companyId);
    }
  });
}

async function processQueue(companyId) {
  const q = getQueue(companyId);
  if (q.processing) return;

  q.processing = true;

  while (q.queue.length > 0) {
    const job = q.queue.shift();

    try {
      const result = await withTimeout(job.handler(), 15000);
      job.resolve(result);

      await delay(DEFAULT_DELAY);

    } catch (err) {
      console.error(`[${companyId}] Job error:`, err.message);     

      if (job.retries < 2) {
        job.retries++;
        q.queue.push(job);
      } else {
        job.reject(err);
      }
    }
  }
  q.processing = false;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Job timeout')), ms)
    )
  ]);
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

export function getQueueSize(companyId) {
  return queues[companyId]?.queue.length || 0;
}