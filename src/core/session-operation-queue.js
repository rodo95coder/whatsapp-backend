// src/core/session-operation-queue.js

import PQueue from "p-queue";

const queues = new Map();

function getQueue(companyId) {
  if (!queues.has(companyId)) {
    queues.set(
      companyId,
      new PQueue({
        concurrency: 1,
      })
    );
  }

  return queues.get(companyId);
}

export async function enqueueSessionOperation(
  companyId,
  task
) {
  const queue = getQueue(companyId);

  return queue.add(task);
}

export async function clearSessionQueue(companyId) {
  const queue = queues.get(companyId);

  if (!queue) return;

  queue.clear();

  queues.delete(companyId);
}