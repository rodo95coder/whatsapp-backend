// src/core/session-operation-queue.js

import PQueue from "p-queue";

const queues = new Map();

function createQueue() {
  return new PQueue({
    concurrency: 1,
  });
}

function getQueue(companyId) {
  if (!queues.has(companyId)) {
    queues.set(companyId, createQueue());
  }

  return queues.get(companyId);
}

export async function enqueueSessionOperation(companyId, task) {
  const queue = getQueue(companyId);

  return queue.add(task);
}

export function getQueueSize(companyId) {
  const queue = queues.get(companyId);

  if (!queue) {
    return 0;
  }

  return queue.size;
}

