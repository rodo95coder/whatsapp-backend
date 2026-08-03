import os from "node:os";

import config from "../config/env.js";
import logger from "../utils/logger.js";
import store from "./session-store.js";

const MB = 1024 * 1024;

export function startSessionCapacityMonitor() {
  let lastWarningAt = 0;

  const timer = setInterval(() => {
    const freeMemoryMb = Math.round(os.freemem() / MB);
    const processRssMb = Math.round(process.memoryUsage().rss / MB);
    const runtimes = store.getAllRuntimes();
    const connected = runtimes.filter((runtime) => runtime.state === "CONNECTED").length;
    const connecting = runtimes.filter((runtime) => runtime.creating || runtime.state === "CONNECTING" || runtime.state === "QR_REQUIRED").length;
    const pressured = freeMemoryMb <= config.sessionCapacityWarnFreeMemoryMb
      || processRssMb >= config.sessionCapacityWarnProcessRssMb;

    if (!pressured || Date.now() - lastWarningAt < config.sessionCapacityWarnCooldownMs) return;

    lastWarningAt = Date.now();
    logger.warn(
      `session.capacity.warning total=${runtimes.length} connected=${connected} connecting=${connecting} processRssMb=${processRssMb} freeSystemMemoryMb=${freeMemoryMb}`,
    );
  }, config.sessionWatchdogIntervalMs);

  timer.unref?.();
  return () => clearInterval(timer);
}
