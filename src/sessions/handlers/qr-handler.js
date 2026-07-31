// src/sessions/handlers/qr-handler.js

import logger from "../../utils/logger.js";
import store from "../session-store.js";
import config from "../../config/env.js";
import { setSessionState } from "../session-state.js";

const { maxQrAttempts } = config;

export async function handleQr({ companyId, base64Qr, attempt, runtime: expectedRuntime, generationId }) {
  const runtime = store.getRuntime(companyId);

  if (!runtime || (expectedRuntime && runtime !== expectedRuntime)) {
    return;
  }

  if (generationId !== undefined && !runtime.isCurrentGeneration(generationId)) return;

  if (runtime.destroying) {
    return;
  }

  if (runtime.state === "QRCODE_EXPIRED") {
    return;
  }

  runtime.qr = base64Qr;
  runtime.qrAttempts = attempt;
  runtime.lastQrAt = Date.now();
  runtime.touch();

  setSessionState(companyId, "QR_REQUIRED", { runtime, generationId });

  logger.info(`[${companyId}] QR attempt ${attempt}/${maxQrAttempts}`);

  if (attempt >= maxQrAttempts) {
    logger.warn(`[${companyId}] QR max attempts reached`);

    runtime.qr = null;
    setSessionState(companyId, "QRCODE_EXPIRED");
  }
}
