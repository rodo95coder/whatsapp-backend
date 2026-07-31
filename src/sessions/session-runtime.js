export class SessionRuntime {
  constructor(companyId) {
    this.companyId = companyId;

    this.client = null;
    this.browser = null;
    this.browserPid = null;
    this.state = "IDLE";
    this.qr = null;
    this.qrAttempts = 0;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.creating = false;
    this.destroying = false;
    this.manualLogout = false;
    this.connectPromise = null;
    this.updatedAt = Date.now();
    this.lastQrAt = null;
    this.pendingFolderCleanup = false;
    this.generationId = 0;
    this.operationId = null;
    this.initStartedAt = null;
    this.lastProgressAt = null;
    this.reason = null;
    this.shutdownPromise = null;
    this.shuttingDown = false;
  }

  touch() {
    this.updatedAt = Date.now();
  }

  beginGeneration() {
    this.generationId += 1;
    this.operationId = `${this.companyId}:${this.generationId}:${Date.now()}`;
    this.initStartedAt = Date.now();
    this.lastProgressAt = this.initStartedAt;
    this.reason = null;
    this.manualLogout = false;
    this.touch();
    return this.generationId;
  }

  invalidateGeneration() {
    this.generationId += 1;
    this.touch();
    return this.generationId;
  }

  isCurrentGeneration(generationId) {
    return this.generationId === generationId && !this.shuttingDown;
  }
}
