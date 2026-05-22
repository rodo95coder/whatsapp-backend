// src/sessions/session-cleanup.js

import logger from "../utils/logger.js";
import store from "./session-store.js";
import { resetSessionState } from "./session-lifecycle.js";

const STALE_STATES = ["FAILED", "DISCONNECTED", "IDLE"];

const CLEANUP_AFTER_MS = 1000 * 60 * 60;

export async function cleanupInactiveSessions() {
  const runtimes = store.getAllRuntimes();

  for (const runtime of runtimes.values()) {
    const inactiveMs = Date.now() - runtime.lastActivityAt;

    if (!STALE_STATES.includes(runtime.state)) {
      continue;
    }

    if (inactiveMs < CLEANUP_AFTER_MS) {
      continue;
    }

    logger.warn(`[${runtime.companyId}] Limpiando runtime inactivo`);

    try {
      await resetSessionState(runtime.companyId);
    } catch (err) {
      logger.error(`[${runtime.companyId}] Error cleanup: ${err.message}`);
    }
  }
}

setInterval(cleanupInactiveSessions, 1000 * 60 * 60);
