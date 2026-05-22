// index.js

import "dotenv/config";
import fs from "fs-extra";
import app from "./src/app.js";
import config from "./src/config/env.js";
import logger from "./src/utils/logger.js";
import { restoreSessionsOnBoot } from "./src/sessions/restore-manager.js";
import store from "./src/sessions/session-store.js";
import { shutdownSession } from "./src/sessions/session-shutdown-manager.js";

const { port } = config;
const HOST = "0.0.0.0";

await fs.ensureDir(config.sessionsPath);
await fs.ensureDir(config.tempPath);

process.on("unhandledRejection", (reason) => {
  logger.error(`UnhandledRejection: ${reason?.stack || reason}`);
});

process.on("uncaughtException", async (error) => {
  logger.error(`UncaughtException: ${error?.stack || error}`);

  process.exit(1);
});

async function gracefulShutdown(signal) {
  logger.warn(`Graceful shutdown (${signal})`);

  try {
    const runtimes = Array.from(store.getAllRuntimes().keys());

    await Promise.allSettled(
      runtimes.map((companyId) =>
        shutdownSession(companyId, {
          reason: signal,
          deleteFolder: false,
          remove: false,
        }),
      ),
    );
  } catch (err) {
    logger.error(`Graceful shutdown error: ${err.message}`);
  }

  process.exit(0);
}

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM");
});

app.listen(port, HOST, () => {
  logger.info(`Servidor WhatsApp API corriendo en ${HOST}:${port}`);

  restoreSessionsOnBoot().catch((err) => {
    logger.error(`Restore error: ${err.message}`);
  });
});
