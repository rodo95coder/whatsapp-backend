// src/sessions/handlers/qr-handler.js

import logger from "../../utils/logger.js";
import config from "../../config/env.js";
import store from "../session-store.js";
import { setSessionState } from "../session-state.js";
import { shutdownSession } from "../session-shutdown-manager.js";

const MAX_QR_ATTEMPTS = Number(config.maxQrAttempts || 2);

export async function handleQr({ companyId, base64Qr, generation }) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return;
  }

  if (runtime.shutdown.qrExpired) {
    return;
  }

  if (runtime.closed) {
    return;
  }

  // =========================
  // VALIDATIONS
  // =========================

  if (runtime.generation !== generation) {
    return;
  }

  if (runtime.shutdown?.inProgress) {
    return;
  }

  if (runtime.manualLogout) {
    return;
  }

  // =========================
  // IGNORAR QR DUPLICADO
  // =========================

  if (runtime.lastQr === base64Qr) {
    return;
  }

  runtime.lastQr = base64Qr;

  // =========================
  // SAVE QR
  // =========================

  runtime.qr = base64Qr;

  runtime.qrAttempts++;

  logger.info(
    `[${companyId}] Nuevo QR (${runtime.qrAttempts}/${MAX_QR_ATTEMPTS})`,
  );

  setSessionState(companyId, "WAITING_QR");

  // =========================
  // MAX ATTEMPTS
  // =========================

  if (runtime.qrAttempts >= MAX_QR_ATTEMPTS) {
  logger.warn(`[${companyId}] Máximo QR alcanzado`);

  await shutdownSession(companyId, {
    reason: "QR_FAILED",
    deleteFolder: true,
  });

  return;

  }
}
