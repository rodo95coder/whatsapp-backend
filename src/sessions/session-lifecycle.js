// src/sessions/session-lifecycle.js

import { exec } from "child_process";
import logger from "../utils/logger.js";
import store from "./session-store.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function execAsync(command) {
  return new Promise((resolve) => {
    exec(command, () => resolve());
  });
}

async function killProcess(pid) {
  if (!pid) {
    return;
  }
  const command =
    process.platform === "win32"
      ? `taskkill /PID ${pid} /T /F`
      : `kill -9 ${pid}`;

  try {
    await execAsync(command);
  } catch {}
}

export async function destroyClient(companyId) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  if (runtime.destroying) {
    return;
  }

  runtime.destroying = true;
  logger.warn(`[${companyId}] Destroying client`);

  try {
    if (runtime.reconnectTimer) {
      clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
    }

    const client = runtime.client;
    const browser = runtime.browser;
    const browserPid = runtime.browserPid;

    try {
      client?.removeAllListeners?.();
    } catch {}

    try {
      await client?.close?.();
    } catch {}

    try {
      await browser?.close?.();
    } catch {}

    await delay(2000);

    if (browserPid) {
      await killProcess(browserPid);
    }

    runtime.client = null;
    runtime.browser = null;
    runtime.browserPid = null;
    runtime.qr = null;
    runtime.qrAttempts = 0;
  } finally {
    runtime.destroying = false;
    runtime.creating = false;
    runtime.connectPromise = null;
    runtime.touch();
  }
}
