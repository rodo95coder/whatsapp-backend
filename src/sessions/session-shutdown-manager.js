import logger from "../utils/logger.js";
import store, { removeRuntime } from "./session-store.js";
import { setSessionState } from "./session-state.js";
import { destroyClient } from "./session-lifecycle.js";
import { cleanupSessionFiles } from "./cleanup-session-files.js";

export async function shutdownSession(
  companyId,
  { reason = "UNKNOWN", deleteFolder = false } = {},
) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }
  logger.warn(`[${companyId}] Shutdown (${reason})`);

  try {
    setSessionState(companyId, "STOPPING");
    runtime.manualLogout = reason === "LOGOUT";
    await destroyClient(companyId);

    if (deleteFolder) {
      await cleanupSessionFiles(companyId);
    }
  } finally {
    removeRuntime(companyId);
    logger.warn(`[${companyId}] Runtime eliminado`);
  }
}
