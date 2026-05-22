// src/services/session.service.js

import store from "../sessions/session-store.js";
import { shutdownSession } from "../sessions/session-shutdown-manager.js";
import {
  enqueueSessionOperation,
  clearSessionQueue,
} from "../core/session-operation-queue.js";
import { createClient } from "../sessions/client-factory.js";
import { resetSessionState } from "../sessions/session-lifecycle.js";
import { getSessionState } from "../sessions/session-state.js";

export function getClient(companyId) {
  return store.getRuntime(companyId)?.client || null;
}

export async function initSession(companyId) {
  const runtime = store.createRuntime(companyId);

  if (runtime.creating) {
    return {
      success: true,
      msg: "already_initializing",
    };
  }

  enqueueSessionOperation(companyId, async () => {
    try {
      await resetSessionState(companyId);
      const existingRuntime = store.getRuntime(companyId);

      if (existingRuntime?.shutdown?.completed) {
        store.removeRuntime(companyId);
      }

      await createClient(companyId);
    } catch (err) {
      console.error(err);
    }
  });

  return {
    success: true,
    msg: "initializing",
  };
}

export function getQR(companyId) {
  const runtime = store.getRuntime(companyId);

  return runtime?.qr || null;
}

export function getStatus(companyId) {
  return getSessionState(companyId);
}

export async function logout(companyId) {
  await shutdownSession(companyId, {
    reason: "LOGOUT",
    deleteFolder: true,
    force: true,
  });

  store.removeRuntime(companyId);
}

/* export async function logout(companyId) {
  return enqueueSessionOperation(companyId, async () => {
    const runtime = store.getRuntime(companyId);

    if (runtime) {
      runtime.manualLogout = true;
    }

    await resetSessionState(companyId, {
      destroySessionFolder: true,
    });

    await clearSessionQueue(companyId);

    return {
      success: true,
      msg: "logout_success",
    };
  });
} */

export default {
  initSession,
  getQR,
  getStatus,
  getClient,
  logout,
  _internal: store,
};
