import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.GLOBAL_TOKEN ||= "test-token";

const store = await import("../src/sessions/session-store.js");
const { sendMessage } = await import("../src/services/message/message-sender.js");

const companyId = "message-sender-test";

afterEach(() => {
  store.removeRuntime(companyId);
});

function connectedRuntime(evaluate) {
  const runtime = store.createRuntime(companyId);
  runtime.state = "CONNECTED";
  runtime.client = {
    page: Promise.resolve({ evaluate }),
  };
  return runtime;
}

test("envÃ­a texto directamente por WPP y conserva el ACK", async () => {
  const runtime = connectedRuntime(async (_callback, payload) => {
    assert.deepEqual(payload, {
      targetChatId: "51971934057@c.us",
      content: "mensaje de prueba",
    });
    return {
      id: "message-123",
      to: "51971934057@c.us",
      from: "51900000000@c.us",
      ack: 1,
      transportResult: "OK",
      timestamp: 123,
    };
  });

  const result = await sendMessage({
    companyId,
    numbers: ["51971934057"],
    text: "mensaje de prueba",
  });

  assert.deepEqual(result.summary, { total: 1, successful: 1, failed: 0 });
  assert.equal(result.results[0].status, "server");
  assert.equal(result.results[0].deliveryConfirmed, false);
  assert.equal("messageId" in result.results[0], false);
  assert.equal(runtime.trackedMessages.has("message-123"), true);
});

test("expone messageId solo cuando el consumidor lo solicita", async () => {
  connectedRuntime(async () => ({
    id: "message-include-id",
    ack: 1,
    transportResult: "OK",
  }));

  const result = await sendMessage({
    companyId,
    numbers: ["51971934057"],
    text: "mensaje de prueba",
    includeMessageId: true,
  });

  assert.equal(result.results[0].messageId, "message-include-id");
});

test("reporta fallo cuando WPP no acepta el texto", async () => {
  connectedRuntime(async () => {
    throw new Error("WPP send failure");
  });

  const result = await sendMessage({
    companyId,
    numbers: ["51971934057"],
    text: "mensaje de prueba",
  });

  assert.deepEqual(result.summary, { total: 1, successful: 0, failed: 1 });
  assert.deepEqual(result.results[0], {
    number: "51971934057",
    success: false,
    error: "WPP send failure",
  });
});
