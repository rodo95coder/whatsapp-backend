// src/services/session.service.js

import store from "../sessions/session-store.js";
import { enqueueSessionOperation } from "../core/session-operation-queue.js";
import { createClient } from "../sessions/client-factory.js";
import { getSessionState } from "../sessions/session-state.js";
import { sendMessage } from "./message/message-sender.js";
import logger from "../utils/logger.js";
import { shutdownSession } from "../sessions/session-shutdown-manager.js";
import config from "../config/env.js";
import { withTimeout } from "../utils/timeout.js";

export function getClient(companyId) {
  return store.getRuntime(companyId)?.client || null;
}

export async function initSession(companyId) {
  return enqueueSessionOperation(companyId, async () => {
    const runtime = store.createRuntime(companyId);

    if (runtime.client) {
      return {
        success: true,
        msg: "already_initialized",
      };
    }

    if (runtime.connectPromise || runtime.creating) {
      return {
        success: true,
        msg: "already_initializing",
      };
    }

    createClient(companyId).catch((err) => {
      logger.error(`[${companyId}] createClient async error: ${err.message}`);
    });

    return {
      success: true,
      msg: "initializing",
    };
  });
}

export function getQR(companyId) {
  const runtime = store.getRuntime(companyId);

  return runtime?.qr || null;
}

export function getStatus(companyId) {
  return getSessionState(companyId);
}

export async function forceReset(companyId, {
  deleteAuth = false,
  deleteSessionMetadata = false,
  restart = false,
} = {}) {
  const result = await shutdownSession(companyId, {
    reason: "FORCE_RESET",
    deleteAuth,
    deleteSessionMetadata,
    restart,
  });

  if (restart) {
    await initSession(companyId);
  }

  return {
    ...result,
    deleteAuth,
    deleteSessionMetadata,
    restart,
  };
}

export async function logout(companyId) {
  return enqueueSessionOperation(companyId, async () => {
    const runtime = store.getRuntime(companyId);
    let remoteLogout = {
      attempted: false,
      success: false,
      error: null,
    };

    // Only an explicit user logout unpairs the linked WhatsApp device. Resets,
    // timeouts and automatic recovery intentionally remain local operations.
    if (runtime?.client?.logout) {
      runtime.manualLogout = true;
      remoteLogout.attempted = true;

      try {
        const loggedOut = await withTimeout(
          Promise.resolve(runtime.client.logout()),
          config.logoutTimeoutMs,
          "Remote WhatsApp logout timeout",
        );

        if (loggedOut !== true) {
          throw new Error("WhatsApp did not confirm remote logout");
        }

        remoteLogout.success = true;
        logger.info(`[${companyId}] remote logout completed`);
      } catch (error) {
        remoteLogout.error = error.message;
        logger.warn(`[${companyId}] remote logout failed: ${error.message}`);
      }
    }

    await shutdownSession(companyId, {
      reason: "LOGOUT",
      deleteAuth: true,
      deleteSessionMetadata: true,
    });

    return {
      success: true,
      msg: "logout_success",
      remoteLogout,
    };
  });
}

export { sendMessage };

export default {
  initSession,
  getQR,
  getStatus,
  getClient,
  logout,
  forceReset,
  sendMessage,
  _internal: store,
};
