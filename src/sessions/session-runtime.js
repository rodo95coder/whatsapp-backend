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
  }

  touch() {
    this.updatedAt = Date.now();
  }
}