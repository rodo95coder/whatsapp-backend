import config from "../config/env.js";
import logger from "../utils/logger.js";
import store from "./session-store.js";
import { shutdownSession } from "./session-shutdown-manager.js";
import { scheduleReconnect } from "./reconnect-manager.js";

export function startSessionWatchdog() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
    for (const runtime of store.getAllRuntimes()) {
      const stuck = runtime.state === "CONNECTING"
        && !runtime.shuttingDown
        && runtime.initStartedAt
        && Date.now() - runtime.initStartedAt >= config.initSessionTimeoutMs;

      if (!stuck) continue;

      logger.warn(`[${runtime.companyId}] watchdog.timeout generation=${runtime.generationId}`);
      await shutdownSession(runtime.companyId, {
        reason: "INITIALIZATION_TIMEOUT",
        runtime,
      });
      scheduleReconnect(runtime.companyId, { runtime });
    }
    } finally {
      running = false;
    }
  }, config.sessionWatchdogIntervalMs);

  timer.unref?.();
  return () => clearInterval(timer);
}
