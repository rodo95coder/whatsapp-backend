import v8 from "node:v8";

import config from "../../config/env.js";
import logger from "../../utils/logger.js";
import store from "../../sessions/session-store.js";

function entries() {
  return store.getAllRuntimes().flatMap((runtime) =>
    Array.from(runtime.trackedMessages.values()).map((message) => ({ runtime, message })),
  );
}

function purgeOldest(count) {
  const oldest = entries().sort((a, b) => a.message.updatedAt - b.message.updatedAt).slice(0, count);
  for (const { runtime, message } of oldest) runtime.trackedMessages.delete(message.messageId);
  return oldest.length;
}

function prune(runtime) {
  const now = Date.now();
  for (const [id, message] of runtime.trackedMessages) {
    if (now - message.updatedAt > config.messageTrackerTtlMs) runtime.trackedMessages.delete(id);
  }

  while (runtime.trackedMessages.size > config.maxTrackedMessagesPerSession) {
    const oldest = Array.from(runtime.trackedMessages.values())
      .sort((a, b) => a.updatedAt - b.updatedAt)[0];
    runtime.trackedMessages.delete(oldest.messageId);
  }
  const all = entries();
  if (all.length > config.maxTrackedMessagesTotal) purgeOldest(all.length - config.maxTrackedMessagesTotal);

  const heap = v8.getHeapStatistics();
  const percent = (process.memoryUsage().heapUsed / heap.heap_size_limit) * 100;
  if (percent >= config.messageTrackerHeapPercent) {
    const removed = purgeOldest(Math.ceil(entries().length / 2));
    logger.warn(`message-tracker memory-guard heap=${percent.toFixed(1)}% removed=${removed}`);
  }
}

export function trackMessage(runtime, message) {
  if (!message.messageId) return null;
  const tracked = {
    messageId: message.messageId,
    to: message.to || null,
    status: message.status || "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  runtime.trackedMessages.set(tracked.messageId, tracked);
  prune(runtime);
  return tracked;
}

export function updateMessageAck(runtime, ack) {
  const messageId = ack?.id?._serialized || ack?.id || null;
  const message = messageId ? runtime.trackedMessages.get(messageId) : null;
  if (!message) return null;
  message.status = mapAckStatus(ack.ack);
  message.updatedAt = Date.now();
  prune(runtime);
  return message;
}

export function getTrackedMessage(companyId, messageId) {
  const runtime = store.getRuntime(companyId);
  if (!runtime) return null;
  prune(runtime);
  return runtime.trackedMessages.get(messageId) || null;
}

export function mapAckStatus(ack) {
  return ({ "-1": "error", 0: "pending", 1: "server", 2: "delivered", 3: "read", 4: "played", 5: "played" })[String(ack)] || "unknown";
}
