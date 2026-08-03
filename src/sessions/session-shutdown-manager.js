import logger from "../utils/logger.js";
import store from "./session-store.js";
import { setSessionState } from "./session-state.js";
import { destroyClient } from "./session-lifecycle.js";
import { cleanupSessionFiles } from "./cleanup-session-files.js";

export async function shutdownSession(
  companyId,
  { reason = "UNKNOWN", deleteAuth = false, deleteSessionMetadata = false, runtime: expectedRuntime, restart = false, skipClientClose = false } = {},
) {
  const runtime = store.getRuntime(companyId);

  if (!runtime || (expectedRuntime && runtime !== expectedRuntime)) {
    if (!runtime && (deleteAuth || deleteSessionMetadata)) {
      await cleanupSessionFiles(companyId, { deleteAuth, deleteSessionMetadata });
    }
    return { success: true, skipped: true };
  }

  if (runtime.shutdownPromise) {
    return runtime.shutdownPromise;
  }

  runtime.shutdownPromise = (async () => {
    const generationId = runtime.generationId;
    logger.warn(`[${companyId}] shutdown.start generation=${generationId} reason=${reason}`);
    runtime.shuttingDown = true;
    runtime.invalidateGeneration();
    setSessionState(companyId, "SHUTTING_DOWN", { runtime, reason });
    runtime.manualLogout = reason === "LOGOUT";
    await destroyClient(companyId, { runtime, skipClientClose });

    if (deleteAuth || deleteSessionMetadata) {
      await cleanupSessionFiles(companyId, { deleteAuth, deleteSessionMetadata });
    }

    runtime.client = null;
    runtime.browser = null;
    runtime.browserPid = null;
    runtime.shuttingDown = false;
    setSessionState(companyId, restart ? "IDLE" : "DISCONNECTED", { runtime, reason });
    logger.warn(`[${companyId}] shutdown.complete generation=${generationId} reason=${reason}`);
    return { success: true };
  })();

  try {
    return await runtime.shutdownPromise;
  } finally {
    runtime.shutdownPromise = null;
  }
}
