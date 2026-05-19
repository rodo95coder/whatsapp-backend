// src/sessions/session-state.js

import store from "./session-store.js";

const NORMALIZED_STATES = {
  // =========================
  // CONNECTED
  // =========================
  MAIN: "CONNECTED",
  NORMAL: "CONNECTED",
  inChat: "CONNECTED",
  isLogged: "CONNECTED",

  // =========================
  // QR
  // =========================
  QR_READ_SUCCESS: "QRCODE",
  QR_READY: "QRCODE",
  notLogged: "QRCODE",

  // =========================
  // DISCONNECTED
  // =========================
  browserClose: "DISCONNECTED",
  CLOSED: "DISCONNECTED",

  // =========================
  // CONNECTING
  // =========================
  CONNECTING: "CONNECTING",
  OPENING: "CONNECTING",

  // =========================
  // FAILED
  // =========================
  TIMEOUT: "FAILED",
  CONFLICT: "FAILED",
  UNPAIRED: "FAILED",
};

export function normalizeEngineState(state) {
  if (!state) {
    return "UNKNOWN";
  }

  return NORMALIZED_STATES[state] || state;
}

export function setSessionState(companyId, state) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  runtime.previousState = runtime.state || null;

  runtime.state = normalizeEngineState(state);

  runtime.lastStateChangeAt = Date.now();

  runtime.touch();
}

export function setEngineState(companyId, engineState) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  runtime.engineState = engineState;

  runtime.touch();
}

export function getSessionState(companyId) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return "NOT_FOUND";
  }

  return runtime.state || "IDLE";
}

export function clearSessionState(companyId) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  runtime.state = "IDLE";
  runtime.previousState = null;
  runtime.engineState = null;

  runtime.touch();
}