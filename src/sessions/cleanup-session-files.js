import fs from "fs-extra";
import path from "path";

import { companyFolder } from "./session-files.js";
import logger from "../utils/logger.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cleanupSessionFiles(companyId, {
  deleteAuth = true,
  deleteSessionMetadata = true,
} = {}) {
  const folder = companyFolder(companyId);
  logger.warn(`[${companyId}] cleanup.files auth=${deleteAuth} metadata=${deleteSessionMetadata}`);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      if (!(await fs.pathExists(folder))) return true;

      if (deleteAuth && deleteSessionMetadata) {
        await fs.remove(folder);
      } else {
        if (deleteAuth) await fs.remove(path.join(folder, "chrome"));
        if (deleteSessionMetadata) {
          await fs.remove(path.join(folder, "webhook.json"));
          await fs.remove(path.join(folder, "session-ready.json"));
        }
      }

      logger.info(`[${companyId}] cleanup.files.complete`);
      return true;
    } catch (error) {
      logger.warn(`[${companyId}] cleanup.files.retry=${attempt} error=${error.message}`);
      await delay(3000);
    }
  }

  logger.error(`[${companyId}] cleanup.files.failed`);
  return false;
}
