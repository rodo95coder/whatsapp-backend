// src/core/message-queue.js

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
    return Promise.reject(new Error('Queue overflow'));
  }

  return new Promise((resolve, reject) => {
    q.queue.push({
      handler,
      resolve,
      reject
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
      const result = await job.handler();
      job.resolve(result);
      await delay(DEFAULT_DELAY);
    } catch (err) {
      job.reject(err);
    }
  }

  q.processing = false;
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

export function getQueueSize(companyId) {
  return queues[companyId]?.queue.length || 0;
}