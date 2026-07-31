// src/sessions/session-state.js

import store from "./session-store.js";

export function setSessionState(companyId, state, { runtime, generationId, reason } = {}) {
  const currentRuntime = store.getRuntime(companyId);

  if (!currentRuntime || (runtime && currentRuntime !== runtime)) {
    return false;
  }

  if (generationId !== undefined && !currentRuntime.isCurrentGeneration(generationId)) {
    return false;
  }

  currentRuntime.state = state;
  if (reason !== undefined) {
    currentRuntime.reason = reason;
  }

  currentRuntime.touch();
  return true;
}

export function getSessionState(companyId) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return "NOT_FOUND";
  }

  return {
    status: runtime.state || "IDLE",
    reason: runtime.reason || null,
    updatedAt: new Date(runtime.updatedAt).toISOString(),
    generationId: runtime.generationId,
    recoverable: !runtime.manualLogout,
  };
}
