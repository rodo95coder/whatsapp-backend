// src/sessions/session-runtime.js

export class SessionRuntime {
  constructor(companyId) {
    this.companyId = companyId;

    // =========================
    // CLIENT
    // =========================
    this.client = null;
    this.browser = null;

    // =========================
    // STATE
    // =========================
    this.state = "IDLE";
    this.previousState = null;
    this.engineState = null;

    // =========================
    // QR
    // =========================
    this.qr = null;
    this.qrAttempts = 0;
    this.lastQrAt = null;
    this.lastQr = null;

    // =========================
    // RECONNECT
    // =========================
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;

    // =========================
    // LIFECYCLE
    // =========================
    this.creating = false;
    this.destroying = false;
    this.initialized = false;
    this.manualLogout = false;

    // =========================
    // TOKENS
    // =========================
    this.generation = 0;
    this.operationId = null;

    // =========================
    // ABORT
    // =========================
    this.abortController = null;
    this.closed = false;

    // =========================
    // EVENTS
    // =========================
    this.listenersRegistered = false;

    // =========================
    // METADATA
    // =========================
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.lastActivityAt = Date.now();
  }

  touch() {
    this.updatedAt = Date.now();
    this.lastActivityAt = Date.now();
  }
}
