// src/services/session.service.js

import store from "../sessions/session-store.js";
import { enqueueSessionOperation } from "../core/session-operation-queue.js";
import { createClient } from "../sessions/client-factory.js";
import { getSessionState } from "../sessions/session-state.js";
import { sendMessage } from "./message/message-sender.js";
import logger from "../utils/logger.js";
import { shutdownSession } from "../sessions/session-shutdown-manager.js";
import { destroyClient } from "../sessions/session-lifecycle.js";

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

export async function logout(companyId) {
  return enqueueSessionOperation(companyId, async () => {
    const runtime = store.getRuntime(companyId);

    if (runtime) {
      runtime.manualLogout = true;

      if (runtime.creating && !runtime.client) {
        runtime.pendingFolderCleanup = true;

        return {
          success: true,
          msg: "logout_pending_until_qr_autoclose",
        };
      }
    }
    await shutdownSession(companyId, {
      reason: "LOGOUT",
      deleteFolder: true,
    });

    return {
      success: true,
      msg: "logout_success",
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
  sendMessage,
  _internal: store,
};
