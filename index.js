//index.js
import 'dotenv/config';
import fs from "fs-extra";
import app from './src/app.js';
import config from './src/config/env.js';
import { restoreSessionsOnBoot } from './src/sessions/restore-manager.js';

const { port } = config;
const HOST = '0.0.0.0';

await fs.ensureDir(config.sessionsPath);
await fs.ensureDir(config.tempPath);

process.on("unhandledRejection", (reason) => {
  const message = String(reason?.message || reason);

  // Ignorar errores esperados de cierre
  if (
    message.includes("Connection closed") ||
    message.includes("Protocol error") ||
    message.includes("Target closed") ||
    message.includes("Session closed")
  ) {
    console.warn("Unhandled rejection ignorado:", message);
    return;
  }

  console.error("Unhandled Rejection REAL:", reason);
});

process.on("uncaughtException", (error) => {
  const msg = error?.message || "";

  const ignoredErrors = [
    "Connection closed",
    "Protocol error",
    "Target closed",
    "Auto Close Called",
    "Session closed",
    "Browser has disconnected",
  ];

  if (ignoredErrors.some((x) => msg.includes(x))) {
    console.warn("Excepción controlada:", msg);
    return;
  }

  console.error("Uncaught Exception REAL:", error);
});

app.listen(port, HOST, async () => {
  console.log(`Servidor WhatsApp API en ${HOST}:${port}`);
  await restoreSessionsOnBoot();
});