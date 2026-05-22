// src/sessions/restore-manager.js

import fs from "fs-extra";
import path from "path";
import { setTimeout as sleep } from "timers/promises";
import logger from "../utils/logger.js";
import config from "../config/env.js";
import { createClient } from "./client-factory.js";
import store from "./session-store.js";

const { sessionsPath } = config;

export async function restoreSessionsOnBoot() {
  if (!fs.existsSync(sessionsPath)) {
    return;
  }

  const folders = fs
    .readdirSync(sessionsPath, {
      withFileTypes: true,
    })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  logger.info(`Restaurando ${folders.length} sesiones`);

  for (const companyId of folders) {
    try {
      const runtime = store.createRuntime(companyId);

      if (runtime.shutdown?.inProgress) {
        continue;
      }

      const sessionFolder = path.join(sessionsPath, companyId);

      const hasTokens =
        fs.existsSync(path.join(sessionFolder, "chrome")) ||
        fs.existsSync(path.join(sessionFolder, "session.data"));

      if (!hasTokens) {
        logger.warn(`[${companyId}] Tokens inválidos`);
        continue;
      }

      logger.info(`[${companyId}] Restaurando sesión`);

      await createClient(companyId, {
        isRestore: true,
      });

      await sleep(3000);

    } catch (err) {
      logger.error(
        `[${companyId}] Error restaurando: ${err.message}`
      );
    }
  }
}