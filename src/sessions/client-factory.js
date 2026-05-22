// src/sessions/client-factory.js

import path from "path";
import wppconnect from "@wppconnect-team/wppconnect";
import logger from "../utils/logger.js";
import config from "../config/env.js";
import store from "./session-store.js";
import { ensureCompanyFolder } from "./session-files.js";
import { safeCloseClient, resetSessionState } from "./session-lifecycle.js";
import { setSessionState, setEngineState } from "./session-state.js";
import { handleQr } from "./handlers/qr-handler.js";
import { registerSessionEvents } from "./session-events.js";
import { shutdownSession } from "./session-shutdown-manager.js";

const { sessionsPath, puppeteerPath } = config;

function validateRuntime(runtime, generation) {
  if (!runtime) {
    return false;
  }

  if (runtime.shutdown?.inProgress) {
    return false;
  }

  if (runtime.generation !== generation) {
    return false;
  }

  if (runtime.abortController?.signal?.aborted) {
    return false;
  }

  return true;
}

export async function createClient(companyId) {
  const runtime = store.createRuntime(companyId);

  if (runtime.creating) {
    logger.warn(`[${companyId}] createClient ignorado: creating activo`);

    return false;
  }

  if (runtime.shutdown?.inProgress) {
    logger.warn(`[${companyId}] createClient ignorado: shutdown en progreso`);

    return false;
  }

  runtime.creating = true;
  runtime.manualLogout = false;
  runtime.shutdown.qrExpired = false;
  runtime.generation++;

  const generation = runtime.generation;
  runtime.abortController = new AbortController();

  const abortSignal = runtime.abortController.signal;

  try {
    setSessionState(companyId, "CONNECTING");
    ensureCompanyFolder(companyId);

    // =========================
    // CLIENTE EXISTENTE
    // =========================
    if (runtime.client) {
      try {
        await runtime.client.getConnectionState();

        logger.warn(`[${companyId}] Cliente ya existe`);

        return true;
      } catch {
        await safeCloseClient(companyId);
      }
    }

    const userDataDir = path.join(sessionsPath, companyId, "chrome");

    logger.info(`[${companyId}] Creando cliente`);

    let internalBrowser = null;

    const client = await wppconnect.create({
      session: String(companyId),
      headless: true,
      autoClose: false,
      disableWelcome: true,
      disableSpins: true,
      updatesLog: false,
      logQR: false,

      puppeteerOptions: {
        executablePath: puppeteerPath,

        userDataDir,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
        browserInstance: async (browser, waPage) => {
          internalBrowser = browser;

          runtime.browser = browser;
        },
      },

      catchQR: async (base64Qr, asciiQR, attempt) => {
        const currentRuntime = store.getRuntime(companyId);

        if (!validateRuntime(currentRuntime, generation)) {
          return;
        }

        await handleQr({
          companyId,
          base64Qr,
          generation,
          attempt,
        });
      },

      statusFind: async (status) => {
        /* if (status === "autocloseCalled" || status === "browserClose") {
          logger.warn(`[${companyId}] AutoClose detectado`);

          setSessionState(companyId, "DISCONNECTED");

          return;
        } */
        if (status === "autocloseCalled") {
          await shutdownSession(companyId, {
            reason: "AUTO_CLOSE",
            deleteFolder: true,
          });

          return;
        }

        const currentRuntime = store.getRuntime(companyId);

        if (!validateRuntime(currentRuntime, generation)) {
          return;
        }

        logger.info(`[${companyId}] status: ${status}`);

        setEngineState(companyId, status);

        setSessionState(companyId, status);
      },
    });

    // =========================
    // ABORT
    // =========================
    if (abortSignal.aborted) {
      throw new Error("SESSION_ABORTED");
    }

    const currentRuntime = store.getRuntime(companyId);

    if (!validateRuntime(currentRuntime, generation)) {
      try {
        await client.close();
      } catch (err) {
        logger.warn(err.message);
      }

      return false;
    }

    // =========================
    // STORE CLIENT
    // =========================
    runtime.client = client;

    // =========================
    // EVENTS
    // =========================
    try {
      registerSessionEvents({
        client,
        companyId,
        generation,
      });

      runtime.listenersRegistered = true;
    } catch (err) {
      runtime.listenersRegistered = false;
      throw err;
    }

    runtime.initialized = true;

    setSessionState(companyId, "CONNECTED");

    logger.info(`[${companyId}] Cliente creado correctamente`);

    return true;
  } catch (err) {
    if (
      err.message?.includes("Auto Close Called") ||
      err.message?.includes("Connection closed") ||
      err.message?.includes("SESSION_ABORTED")
    ) {
      logger.warn(`[${companyId}] Cliente cerrado controladamente`);

      return false;
    }

    if (
      err.message?.includes("Auto Close Called") ||
      err.message?.includes("Connection closed")
    ) {
      logger.warn(`[${companyId}] Cliente cerrado controladamente`);

      return false;
    }

    logger.error(`[${companyId}] Error createClient: ${err.message}`);

    setSessionState(companyId, "FAILED");

    await resetSessionState(companyId);

    return false;
  } finally {
    const currentRuntime = store.getRuntime(companyId);

    if (currentRuntime && currentRuntime.generation === generation) {
      currentRuntime.creating = false;

      currentRuntime.touch();
    }
  }
}
