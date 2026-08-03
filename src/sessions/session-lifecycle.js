// src/sessions/session-lifecycle.js

import { execFile } from "child_process";
import path from "path";
import logger from "../utils/logger.js";
import store from "./session-store.js";
import config from "../config/env.js";
import { withTimeout } from "../utils/timeout.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function execFileAsync(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, () => resolve());
  });
}

async function killProcess(pid) {
  if (!pid) {
    return;
  }
  const command =
    process.platform === "win32" ? "taskkill" : "kill";
  const args = process.platform === "win32"
    ? ["/PID", String(pid), "/T", "/F"]
    : ["-KILL", String(pid)];

  try {
    await execFileAsync(command, args);
  } catch (error) {
    logger.debug(`Unable to kill browser pid=${pid}: ${error.message}`);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isExpectedCloseError(error) {
  const message = error?.message || String(error);

  return ["Target closed", "Connection closed", "Execution context was destroyed"].some((expected) =>
    message.includes(expected));
}

async function terminateProfileProcesses(companyId) {
  if (process.platform === "win32") {
    return;
  }

  const profile = path.join(config.sessionsPath, companyId, "chrome");
  const pattern = `--user-data-dir=${escapeRegex(profile)}`;
  await execFileAsync("pkill", ["-TERM", "-f", pattern]);
  await delay(500);
  await execFileAsync("pkill", ["-KILL", "-f", pattern]);
}

export async function closeDetachedClient(client) {
  try {
    await withTimeout(client?.close?.(), config.browserCloseTimeoutMs, "Detached client close timeout");
  } catch (error) {
    logger.debug(`Detached client close failed: ${error.message}`);
  }
}

export async function destroyClient(companyId, { runtime: expectedRuntime, skipClientClose = false } = {}) {
  const runtime = store.getRuntime(companyId);

  if (!runtime || (expectedRuntime && runtime !== expectedRuntime)) {
    return;
  }

  if (runtime.destroying) {
    return runtime.destroyPromise;
  }

  runtime.destroying = true;
  runtime.destroyPromise = (async () => {
    logger.warn(`[${companyId}] destroy.start generation=${runtime.generationId}`);
    if (runtime.reconnectTimer) {
      clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
    }

    const client = runtime.client;
    const browser = runtime.browser;
    const browserPid = runtime.browserPid;

    try {
      client?.removeAllListeners?.();
    } catch (error) {
      logger.debug(`[${companyId}] remove listeners failed: ${error.message}`);
    }

    if (!skipClientClose) {
      try {
        await withTimeout(client?.close?.(), config.browserCloseTimeoutMs, "Client close timeout");
      } catch (error) {
        const log = isExpectedCloseError(error) ? logger.debug : logger.warn;
        log(`[${companyId}] client.close failed: ${error.message}`);
      }
    }

    try {
      await withTimeout(browser?.close?.(), config.browserCloseTimeoutMs, "Browser close timeout");
    } catch (error) {
      const log = isExpectedCloseError(error) ? logger.debug : logger.warn;
      log(`[${companyId}] browser.close failed: ${error.message}`);
    }

    if (browserPid) {
      await killProcess(browserPid);
    }

    await terminateProfileProcesses(companyId);

    runtime.client = null;
    runtime.browser = null;
    runtime.browserPid = null;
    runtime.qr = null;
    runtime.qrAttempts = 0;
  })();

  try {
    await runtime.destroyPromise;
  } finally {
    runtime.destroyPromise = null;
    runtime.destroying = false;
    runtime.creating = false;
    runtime.connectPromise = null;
    runtime.touch();
  }
}
