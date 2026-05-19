//src/sessions/session-lifecycle.js

import fs from "fs-extra";
import store from "./session-store.js";
import { exec } from "child_process";
import logger from "../utils/logger.js";
import { companyFolder } from "./session-files.js";
import { setSessionState } from "./session-state.js";
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function execAsync(command) {
  return new Promise((resolve) => {
    exec(command, () => resolve());
  });
}
async function killChromeProcesses() {
  try {
    await execAsync("taskkill /F /IM chrome.exe /T");
  } catch {}
}

async function waitForBrowserClosed(browser, timeoutMs = 15000) {
  if (!browser) {
    return;
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (!browser.isConnected()) {
        return;
      }
    } catch {
      return;
    }
    await delay(500);
  }
}

export async function safeCloseClient(companyId) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  const client = runtime.client;

  if (!client || typeof client.close !== "function") {
    runtime.client = null;
    return;
  }

  logger.warn(`[${companyId}] Cerrando cliente`);

  try {
    // =========================
    // REMOVE LISTENERS
    // =========================
    try {
      client.removeAllListeners?.();
    } catch {}

    // =========================
    // CLOSE CLIENT
    // =========================
    try {
  const page = await client.page;

  const browser = page?.browser?.();

  if (browser) {
    const pages = await browser.pages();

    for (const p of pages) {
      try {
        await p.close();
      } catch {}
    }

    await browser.close();
  }
} catch (err) {
  logger.warn(
    `[${companyId}] browser close error: ${err.message}`,
  );
}

    // =========================
    // CLOSE BROWSER
    // =========================
    

    // =========================
    // DISCONNECT
    // =========================
    try {
      runtime.browser?.disconnect?.();
    } catch {}

    // =========================
    // WAIT
    // =========================
    try {
      await waitForBrowserClosed(runtime.browser);
    } catch {}

    // =========================
    // FORCE KILL
    // =========================
    

    await waitForBrowserClosed(runtime.browser);

await delay(2000);
  } finally {
    runtime.client = null;
    runtime.browser = null;

    runtime.touch();
  }
}

export async function removeSessionFolder(companyId) {
  const folder = companyFolder(companyId);

  await delay(2000);

  for (let i = 0; i < 10; i++) {
    try {
      await killChromeProcesses();
await delay(3000);
      if (await fs.pathExists(folder)) {
        await fs.remove(folder);
      }

      logger.info(`[${companyId}] Carpeta eliminada`);

      return true;
    } catch (err) {
      logger.warn(
        `[${companyId}] Error eliminando carpeta (retry ${i + 1}): ${err.message}`,
      );

      await delay(5000);
    }
  }

  logger.error(`[${companyId}] No se pudo eliminar carpeta`);

  return false;
}
export async function resetSessionState(
  companyId,
  { destroySessionFolder = false, clearQr = true } = {},
) {
  const runtime = store.getRuntime(companyId);
  if (!runtime) {
    return;
  }
  if (runtime.destroying) {
    logger.warn(`[${companyId}] Reset ignorado: destroy activo`);
    return;
  }
  runtime.destroying = true;
  runtime.generation++;
  logger.warn(`[${companyId}] Reset completo de sesión`);
  try {
    setSessionState(companyId, "STOPPING");
    // =========================
    //  RECONNECT TIMER //
    // =========================
    if (runtime.reconnectTimer) {
      clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
    }
    // =========================
    //  ABORT //
    // =========================
    if (runtime.abortController) {
      runtime.abortController.abort();
      runtime.abortController = null;
      runtime.closed = true;
    }
    // =========================
    //
    // CLOSE CLIENT
    //  =========================
    await safeCloseClient(companyId);
    // =========================
    // QR //
    // =========================
    if (clearQr) {
      runtime.qr = null;
      runtime.qrAttempts = 0;
      runtime.lastQr = null;
    }
    // =========================
    //  FLAGS //
    //  =========================
    runtime.creating = false;
    runtime.listenersRegistered = false;
    runtime.initialized = false;
    // =========================
    //  DELETE SESSION
    //  =========================
    if (destroySessionFolder) {
      await delay(5000);
      await removeSessionFolder(companyId);
    }
    setSessionState(companyId, "IDLE");
  } finally {
    runtime.destroying = false;
    runtime.touch();
  }
}
