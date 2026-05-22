// src/sessions/client-factory.js

import path from "path";
import wppconnect from "@wppconnect-team/wppconnect";
import logger from "../utils/logger.js";
import config from "../config/env.js";
import store from "./session-store.js";
import { setSessionState } from "./session-state.js";
import { handleQr } from "./handlers/qr-handler.js";
import { registerSessionEvents } from "./session-events.js";
import { destroyClient } from "./session-lifecycle.js";
import { scheduleReconnect } from "./reconnect-manager.js";
import { markSessionReady } from "./session-ready.js";

const { sessionsPath, puppeteerPath } = config;

export async function createClient(companyId) {
  const runtime = store.createRuntime(companyId);

  if (runtime.client) {
    logger.warn(`[${companyId}] Cliente ya existe`);
    return true;
  }

  if (runtime.connectPromise) {
    return runtime.connectPromise;
  }

  runtime.connectPromise = (async () => {
    try {
      runtime.creating = true;
      setSessionState(companyId, "CONNECTING");

      const userDataDir = path.join(sessionsPath, companyId, "chrome");

      const client = await wppconnect.create({
        session: String(companyId),
        logQR: false,
        disableWelcome: true,
        updatesLog: false,
        headless: true,
        autoClose: config.qrTimeoutMs,

        puppeteerOptions: {
          headless: true,
          executablePath: config.puppeteerPath || undefined,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-features=site-per-process",
          ],
        },

        catchQR: async (base64Qr, asciiQR, attempt) => {
          await handleQr({
            companyId,
            base64Qr,
            attempt,
          });
        },

        statusFind: async (status) => {
          logger.info(`[${companyId}] status: ${status}`);

          if (status === "autocloseCalled") {
            setSessionState(companyId, "QRCODE_EXPIRED");
            return;
          }
        },
      });

      const currentRuntime = store.getRuntime(companyId);

      if (!currentRuntime || currentRuntime.manualLogout) {
        try {
          await client.close();
        } catch {}

        return false;
      }

      runtime.client = client;
      const page = await client.page;
      const browser = page.browser();
      runtime.browser = browser;
      const process = browser.process();
      runtime.browserPid = process?.pid || null;

      registerSessionEvents({
        client,
        companyId,
      });
      setSessionState(companyId, "CONNECTED");
      await markSessionReady(companyId);
      logger.info(`[${companyId}] Cliente creado`);
      return true;
    } catch (err) {
      const message = err?.message || String(err);

      await destroyClient(companyId);
      // AUTOCLOSE QR expired or auth failure
      if (
        message.includes("Auto Close Called") ||
        message.includes("Failed to authenticate")
      ) {
        logger.warn(`[${companyId}] QR expirado`);

        setSessionState(companyId, "QRCODE_EXPIRED");

        if (runtime.manualLogout || runtime.pendingFolderCleanup) {
          const { cleanupSessionFiles } =
            await import("./cleanup-session-files.js");

          await cleanupSessionFiles(companyId);

          store.removeRuntime(companyId);

          logger.warn(`[${companyId}] Runtime eliminado`);
        }

        return false;
      }

      logger.error(`[${companyId}] createClient error: ${message}`);
      // REAL RECONNECT ONLY IF NOT MANUAL LOGOUT
      const currentRuntime = store.getRuntime(companyId);

      if (currentRuntime && !currentRuntime.manualLogout) {
        scheduleReconnect(companyId);
      }

      return false;
    } finally {
      runtime.creating = false;
      runtime.connectPromise = null;
    }
  })();

  return runtime.connectPromise;
}
