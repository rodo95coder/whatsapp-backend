import test from "node:test";
import assert from "node:assert/strict";

process.env.GLOBAL_TOKEN ||= "test-token";

const store = await import("../src/sessions/session-store.js");
const { setSessionState, getSessionState } = await import("../src/sessions/session-state.js");
const { shutdownSession } = await import("../src/sessions/session-shutdown-manager.js");
const { assertSafeHttpUrl } = await import("../src/utils/url-security.js");
const { logout } = await import("../src/services/session.service.js");

test("bloquea destinos SSRF locales en IPv4 e IPv6", async () => {
  await assert.rejects(assertSafeHttpUrl("http://127.0.0.1/internal"));
  await assert.rejects(assertSafeHttpUrl("http://[::1]/internal"));
  await assert.rejects(assertSafeHttpUrl("http://169.254.169.254/latest/meta-data"));
});

test("una generación antigua no puede actualizar el runtime actual", () => {
  const companyId = "test-generation";
  store.removeRuntime(companyId);
  const runtime = store.createRuntime(companyId);
  const oldGeneration = runtime.beginGeneration();

  assert.equal(setSessionState(companyId, "CONNECTING", { runtime, generationId: oldGeneration }), true);

  runtime.invalidateGeneration();
  assert.equal(setSessionState(companyId, "CONNECTED", { runtime, generationId: oldGeneration }), false);
  assert.equal(getSessionState(companyId).status, "CONNECTING");

  store.removeRuntime(companyId);
});

test("una sesión inexistente conserva el contrato de estado", () => {
  const status = getSessionState("test-missing-session");

  assert.deepEqual(status, {
    status: "NOT_FOUND",
    reason: null,
    updatedAt: null,
    generationId: null,
    recoverable: false,
  });
});

test("shutdown es idempotente y libera una sesión sin cliente", async () => {
  const companyId = "test-shutdown";
  store.removeRuntime(companyId);
  const runtime = store.createRuntime(companyId);
  runtime.beginGeneration();
  runtime.creating = true;

  const [first, second] = await Promise.all([
    shutdownSession(companyId, { reason: "TEST", runtime }),
    shutdownSession(companyId, { reason: "TEST", runtime }),
  ]);

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(runtime.client, null);
  assert.equal(runtime.browser, null);
  assert.equal(getSessionState(companyId).status, "DISCONNECTED");

  store.removeRuntime(companyId);
});

test("logout explÃ­cito desvincula WhatsApp antes del cierre local", async () => {
  const companyId = "test-remote-logout";
  store.removeRuntime(companyId);
  const runtime = store.createRuntime(companyId);
  runtime.beginGeneration();
  let logoutCalls = 0;
  runtime.client = {
    async logout() {
      logoutCalls += 1;
      return true;
    },
    async close() {},
    removeAllListeners() {},
  };

  const result = await logout(companyId);

  assert.equal(logoutCalls, 1);
  assert.deepEqual(result.remoteLogout, {
    attempted: true,
    success: true,
    error: null,
  });
  assert.equal(runtime.manualLogout, true);
  assert.equal(runtime.client, null);
  store.removeRuntime(companyId);
});
