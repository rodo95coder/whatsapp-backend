// src/sessions/session-state.js

import store from "./session-store.js";

export function setSessionState(companyId, state) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  runtime.state = state;

  runtime.touch();
}

export function getSessionState(companyId) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return "NOT_FOUND";
  }

  return runtime.state || "IDLE";
}
