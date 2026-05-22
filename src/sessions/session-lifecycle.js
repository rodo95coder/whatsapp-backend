//src/sessions/session-lifecycle.js

import fs from "fs-extra";
import store from "./session-store.js";
import { exec } from "child_process";
import logger from "../utils/logger.js";
import { companyFolder } from "./session-files.js";
import { shutdownSession } from "./session-shutdown-manager.js";

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

export async function safeCloseClient(companyId) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  if (runtime.closing) {
    return;
  }

  runtime.closing = true;

  const client = runtime.client;
  const browser = runtime.browser;

  logger.warn(`[${companyId}] Cerrando cliente`);

  try {
    client?.removeAllListeners?.();
  } catch {}

  try {
    await Promise.race([client?.close?.(), delay(10000)]);
  } catch {}

  /**
   * =========================
   * CLOSE PAGES
   * =========================
   */
  try {
    if (browser?.pages) {
      const pages = await browser.pages();

      for (const page of pages) {
        try {
          await page.close();
        } catch {}
      }
    }
  } catch {}

  /**
   * =========================
   * CLOSE BROWSER
   * =========================
   */
  try {
    if (browser?.isConnected?.()) {
      await Promise.race([browser.close(), delay(10000)]);
    }
  } catch {}

  /**
   * =========================
   * FORCE KILL PID
   * =========================
   */
  try {
    const process = browser?.process?.();

    if (process?.pid) {
      logger.warn(`[${companyId}] Killing chrome PID ${process.pid}`);

      process.kill("SIGKILL");
    }
  } catch {}

  await delay(3000);

  await killChromeProcesses();

  await delay(3000);

  runtime.client = null;
  runtime.browser = null;
  runtime.closing = false;

  runtime.touch();
}

export async function removeSessionFolder(companyId) {
  const folder = companyFolder(companyId);
  await killChromeProcesses();

  await delay(3000);

  await delay(2000);

  for (let i = 0; i < 10; i++) {
    try {
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
  return shutdownSession(companyId, {
    reason: "RESET",
    deleteFolder: destroySessionFolder,
    clearQr,
  });
}
