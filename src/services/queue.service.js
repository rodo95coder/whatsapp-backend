// src/services/queue.service.js
const queues = new Map();
const processing = new Map();

export async function enqueue(companyId, job) {
  if (!queues.has(companyId)) {
    queues.set(companyId, []);
  }

  queues.get(companyId).push(job);

  if (!processing.get(companyId)) {
    processQueue(companyId);
  }
}

async function processQueue(companyId) {
  processing.set(companyId, true);

  const queue = queues.get(companyId);

  while (queue.length > 0) {
    const job = queue.shift();
    try {
      await job();
    } catch (err) {
      console.error("Error en cola:", err.message);
    }
  }

  processing.set(companyId, false);
}