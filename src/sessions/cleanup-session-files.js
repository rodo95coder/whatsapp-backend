//src/sessions/cleanup-session-files.js

import fs from "fs-extra";
import { companyFolder } from "./session-files.js";
import logger from "../utils/logger.js";
import store from "./session-store.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cleanupSessionFiles(companyId) {
  const folder = companyFolder(companyId);
  logger.warn(`[${companyId}] Cleaning session files`);

  const exists = await fs.pathExists(folder);
  if (!exists) {
    return true;
  }

  // Esperar liberación real del browser
  await delay(5000);

  for (let i = 1; i <= 5; i++) {
    try {
      const runtime = store.getRuntime(companyId);

      if (runtime?.creating) {
        logger.warn(`[${companyId}] Cleanup cancelado: sesión recreándose`);

        return false;
      }
      const exists = await fs.pathExists(folder);

      if (!exists) {
        return true;
      }

      await fs.remove(folder);

      logger.info(`[${companyId}] Session files removed`);
      logger.info(`[${companyId}] Cleanup completed`);

      return true;
    } catch (err) {
      logger.warn(`[${companyId}] Cleanup retry ${i}: ${err.message}`);

      await delay(3000);
    }
  }

  logger.error(`[${companyId}] Failed removing session files`);

  return false;
}
