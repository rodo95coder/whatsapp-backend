import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.GLOBAL_TOKEN ||= "test-token";
process.env.INIT_SESSION_TIMEOUT_MS = "25";
process.env.BROWSER_CLOSE_TIMEOUT_MS = "10";

const store = await import("../src/sessions/session-store.js");
const { createClient } = await import("../src/sessions/client-factory.js");
const { getSessionState } = await import("../src/sessions/session-state.js");
const adapter = await import("../src/sessions/wppconnect-adapter.js");

const ids = ["itest-timeout", "itest-unpaired", "itest-late", "itest-concurrent", "itest-qr"];

afterEach(() => {
  adapter.resetWppClientCreatorForTests();
  for (const id of ids) {
    const runtime = store.getRuntime(id);
    if (runtime?.reconnectTimer) clearTimeout(runtime.reconnectTimer);
    store.removeRuntime(id);
  }
});

function fakeClient() {
  return {
    closeCalls: 0,
    async close() { this.closeCalls += 1; },
    async page() {},
  };
}

test("createClient nunca resuelve: termina en DISCONNECTED y programa recuperaciÃ³n", async () => {
  adapter.setWppClientCreatorForTests(() => new Promise(() => {}));

  const result = await createClient("itest-timeout");
  const runtime = store.getRuntime("itest-timeout");

  assert.equal(result, false);
  assert.equal(getSessionState("itest-timeout").status, "RECONNECTING");
  assert.equal(getSessionState("itest-timeout").reason, "INITIALIZATION_TIMEOUT");
  assert.ok(runtime.reconnectTimer);
});

test("Session Unpaired inicial no cancela el flujo de una sesión nueva", async () => {
  const client = fakeClient();
  client.page = Promise.resolve({
    browser: () => ({
      process: () => null,
      close: async () => {},
    }),
  });
  client.onStateChange = () => {};
  client.onMessage = () => {};
  adapter.setWppClientCreatorForTests(async (options) => {
    await options.statusFind("Session Unpaired");
    return client;
  });

  const result = await createClient("itest-unpaired");
  const status = getSessionState("itest-unpaired");

  assert.equal(result, true);
  assert.equal(status.status, "CONNECTED");
  assert.equal(status.reason, null);
  assert.equal(store.getRuntime("itest-unpaired").reconnectTimer, null);
  assert.equal(client.closeCalls, 0);
});

test("un QR disponible no vence el timeout de arranque ni inicia reconnect", async () => {
  adapter.setWppClientCreatorForTests(async (options) => {
    await options.catchQR("data:image/png;base64,cXI=", null, 1);
    return new Promise(() => {});
  });

  void createClient("itest-qr");
  await new Promise((resolve) => setTimeout(resolve, 50));

  const runtime = store.getRuntime("itest-qr");
  assert.equal(getSessionState("itest-qr").status, "QR_REQUIRED");
  assert.equal(runtime.reconnectTimer, null);
  assert.equal(runtime.creating, true);
});

test("un cliente que resuelve tarde se cierra y no revive el runtime", async () => {
  const client = fakeClient();
  let resolveClient;
  adapter.setWppClientCreatorForTests(() => new Promise((resolve) => { resolveClient = resolve; }));

  const pending = createClient("itest-late");
  const result = await pending;
  resolveClient(client);
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(result, false);
  assert.equal(getSessionState("itest-late").status, "RECONNECTING");
  assert.equal(client.closeCalls, 1);
});

test("dos inicializaciones simultÃ¡neas comparten un Ãºnico create de WPPConnect", async () => {
  let calls = 0;
  adapter.setWppClientCreatorForTests(async () => {
    calls += 1;
    throw new Error("Failed to authenticate");
  });

  const results = await Promise.all([
    createClient("itest-concurrent"),
    createClient("itest-concurrent"),
  ]);

  assert.deepEqual(results, [false, false]);
  assert.equal(calls, 1);
  assert.equal(getSessionState("itest-concurrent").reason, "AUTHENTICATION_FAILED");
});
