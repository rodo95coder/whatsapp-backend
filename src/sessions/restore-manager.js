// src/sessions/restore-manager.js

import fs from "fs-extra";
import path from "path";
import { setTimeout as sleep } from "timers/promises";
import logger from "../utils/logger.js";
import config from "../config/env.js";
import store from "./session-store.js";
import { createClient } from "./client-factory.js";
import { isValidCompanyId } from "../utils/company-id.js";
import { hasSessionReadyMarker } from "./session-ready.js";

const { sessionsPath } = config;

export async function restoreSessionsOnBoot() {
  if (!fs.existsSync(sessionsPath)) {
    return;
  }

  const folders = fs
    .readdirSync(sessionsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  logger.info(`Restaurando ${folders.length} sesiones`);

  let cursor = 0;
  const concurrency = Math.max(1, config.restoreConcurrency);

  async function restoreNext() {
    while (cursor < folders.length) {
      const companyId = folders[cursor++];
    try {
      if (!isValidCompanyId(companyId)) {
        logger.warn(`[${companyId}] Carpeta inválida`);
        continue;
      }

      const runtime = store.getRuntime(companyId);

      if (runtime?.client || runtime?.creating) {
        continue;
      }

      const sessionFolder = path.join(sessionsPath, companyId);
      const chromeFolder = path.join(sessionFolder, "chrome");
      const hasReadyMarker = await hasSessionReadyMarker(companyId);

      if (!fs.existsSync(chromeFolder)) {
        logger.warn(`[${companyId}] Chrome profile no existe`);
        continue;
      }

      if (!hasReadyMarker) {
        logger.warn(`[${companyId}] Sesión no autenticada, no se restaura`);

        continue;
      }

      logger.info(`[${companyId}] Restaurando sesión`);

      await createClient(companyId);

      await sleep(3000);
    } catch (err) {
      logger.error(`[${companyId}] Error restaurando: ${err.message}`);
    }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, folders.length) }, restoreNext));

  logger.info("Restore finalizado");
}
