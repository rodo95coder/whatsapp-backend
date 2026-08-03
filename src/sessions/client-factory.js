import path from "path";

import logger from "../utils/logger.js";
import config from "../config/env.js";
import store, { isCurrentRuntime } from "./session-store.js";
import { setSessionState } from "./session-state.js";
import { handleQr } from "./handlers/qr-handler.js";
import { registerSessionEvents } from "./session-events.js";
import { closeDetachedClient } from "./session-lifecycle.js";
import { shutdownSession } from "./session-shutdown-manager.js";
import { scheduleReconnect } from "./reconnect-manager.js";
import { markSessionReady } from "./session-ready.js";
import { createWppClient } from "./wppconnect-adapter.js";

function isCurrent(companyId, runtime, generationId) {
  return isCurrentRuntime(companyId, runtime) && runtime.isCurrentGeneration(generationId);
}

function errorCode(error) {
  const message = error?.message || String(error);

  if (message.includes("Initialization timeout")) return "INITIALIZATION_TIMEOUT";
  if (message.includes("Runtime.evaluate timed out")) return "PUPPETEER_RUNTIME_EVALUATE_TIMEOUT";
  if (message.includes("Runtime.callFunctionOn timed out")) return "PUPPETEER_PROTOCOL_TIMEOUT";
  if (message.includes("Auto Close Called")) return "QR_TIMEOUT";
  if (message.includes("Failed to authenticate")) return "AUTHENTICATION_FAILED";
  return "WPPCONNECT_CREATE_FAILED";
}

function normalizeEngineState(value) {
  return String(value || "").trim().replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
}

async function waitForClientCreation(createPromise, runtime, generationId) {
  let timeoutId;

  try {
    return await Promise.race([
      createPromise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          // A QR-ready session is in WPPConnect's normal pairing window.
          // Do not start another Chromium against the same userDataDir.
          if (runtime.isCurrentGeneration(generationId) && runtime.state !== "QR_REQUIRED") {
            reject(new Error("Initialization timeout"));
          }
        }, config.initSessionTimeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createClient(companyId) {
  const runtime = store.createRuntime(companyId);

  if (runtime.client) {
    return true;
  }

  if (runtime.connectPromise || runtime.creating || runtime.shuttingDown) {
    return runtime.connectPromise ? runtime.connectPromise.catch(() => false) : false;
  }

  const generationId = runtime.beginGeneration();
  runtime.creating = true;
  setSessionState(companyId, "CONNECTING", { runtime, generationId });
  logger.info(`[${companyId}] init.start generation=${generationId} operation=${runtime.operationId}`);

  const createOptions = {
    session: String(companyId),
    logQR: false,
    disableWelcome: true,
    updatesLog: false,
    headless: true,
    autoClose: config.qrTimeoutMs,
    puppeteerOptions: {
      executablePath: config.puppeteerPath,
      userDataDir: path.join(config.sessionsPath, companyId, "chrome"),
      protocolTimeout: config.puppeteerProtocolTimeoutMs,
      ...(config.puppeteerNoSandbox && {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      }),
    },
    catchQR: async (base64Qr, asciiQR, attempt) => {
      if (!isCurrent(companyId, runtime, generationId)) return;
      runtime.lastProgressAt = Date.now();
      await handleQr({ companyId, base64Qr, attempt, runtime, generationId });
    },
    statusFind: async (status) => {
      if (!isCurrent(companyId, runtime, generationId)) return;
      runtime.lastProgressAt = Date.now();
      logger.info(`[${companyId}] init.status generation=${generationId} status=${status}`);

      const normalizedStatus = normalizeEngineState(status);
      if (normalizedStatus === "AUTOCLOSE_CALLED") {
        await shutdownSession(companyId, {
          reason: "QR_TIMEOUT",
          runtime,
        });
        return;
      }

      // WPPConnect emits "Session Unpaired" while a brand-new session is
      // waiting for its first QR. It is not an error at this stage; the QR
      // callback and the client state events decide the real outcome.
    },
  };
  // Promise.resolve also converts a synchronous WPPConnect throw into the
  // lifecycle error path below.
  const createPromise = Promise.resolve().then(() => createWppClient(createOptions));

  runtime.connectPromise = createPromise;

  try {
    const client = await waitForClientCreation(createPromise, runtime, generationId);

    if (!isCurrent(companyId, runtime, generationId)) {
      await closeDetachedClient(client);
      return false;
    }

    runtime.client = client;
    const page = await client.page;
    const browser = page.browser();
    runtime.browser = browser;
    runtime.browserPid = browser.process()?.pid || null;

    if (!isCurrent(companyId, runtime, generationId)) {
      await closeDetachedClient(client);
      return false;
    }

    registerSessionEvents({ client, companyId, runtime, generationId });
    setSessionState(companyId, "CONNECTED", { runtime, generationId });
    await markSessionReady(companyId);
    logger.info(`[${companyId}] init.connected generation=${generationId}`);
    return true;
  } catch (error) {
    const code = errorCode(error);
    logger.error(`[${companyId}] init.error generation=${generationId} code=${code} error=${error.message}`);

    if (code === "INITIALIZATION_TIMEOUT") {
      createPromise.then((lateClient) => closeDetachedClient(lateClient), () => {});
    }

    if (!isCurrentRuntime(companyId, runtime) || runtime.generationId !== generationId) {
      return false;
    }

    await shutdownSession(companyId, {
      reason: code,
      runtime,
    });

    if (!["UNPAIRED", "QR_TIMEOUT", "AUTHENTICATION_FAILED"].includes(code) && !runtime.manualLogout) {
      scheduleReconnect(companyId);
    }
    return false;
  } finally {
    if (isCurrentRuntime(companyId, runtime) && runtime.generationId === generationId) {
      runtime.creating = false;
      runtime.connectPromise = null;
      runtime.touch();
    }
  }
}
