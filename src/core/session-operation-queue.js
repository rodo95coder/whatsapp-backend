// src/core/session-operation-queue.js

import PQueue from "p-queue";

const queues = new Map();
const cleanupTimers = new Map();
const IDLE_QUEUE_TTL_MS = 5 * 60 * 1000;

function createQueue() {
  return new PQueue({
    concurrency: 1,
  });
}

function getQueue(companyId) {
  const timer = cleanupTimers.get(companyId);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(companyId);
  }
  if (!queues.has(companyId)) {
    queues.set(companyId, createQueue());
  }

  return queues.get(companyId);
}

function scheduleCleanup(companyId, queue) {
  if (queue.size || queue.pending || cleanupTimers.has(companyId)) return;
  const timer = setTimeout(() => {
    if (queues.get(companyId) === queue && !queue.size && !queue.pending) queues.delete(companyId);
    cleanupTimers.delete(companyId);
  }, IDLE_QUEUE_TTL_MS);
  timer.unref?.();
  cleanupTimers.set(companyId, timer);
}

export async function enqueueSessionOperation(companyId, task) {
  const queue = getQueue(companyId);

  return queue.add(task).finally(() => scheduleCleanup(companyId, queue));
}

export function getQueueSize(companyId) {
  const queue = queues.get(companyId);

  if (!queue) {
    return 0;
  }

  return queue.size;
}

