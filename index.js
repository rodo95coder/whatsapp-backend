import 'dotenv/config';
import app from './src/app.js';
import config from './src/config/env.js';
import { restoreSessionsOnBoot } from './src/services/session.service.js';

const { port } = config;
const HOST = '0.0.0.0';

process.on("unhandledRejection", (reason) => {
  const msg = reason?.message || "";

  if (
    msg.includes("Connection closed") ||
    msg.includes("Protocol error") ||
    msg.includes("Target closed") ||
    msg.includes("Session closed")
  ) {
    console.warn("Puppeteer cierre controlado:", msg);
    return;
  }

  console.error("Unhandled Rejection REAL:", msg);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error.message);
});

app.listen(port, HOST, async () => {
  console.log(`Servidor WhatsApp API en ${HOST}:${port}`);
  await restoreSessionsOnBoot();
});