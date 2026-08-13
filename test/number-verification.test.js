import test from "node:test";
import assert from "node:assert/strict";

const { normalizeContactId, verifyWhatsAppNumber } = await import("../src/services/number-verification.js");

test("normaliza el número al formato que requiere checkNumberStatus", () => {
  assert.equal(normalizeContactId("+51 992-387-729"), "51992387729@c.us");
  assert.throws(() => normalizeContactId("123"), /number inválido/);
});

test("devuelve numberExists de la API actual de WPPConnect", async () => {
  let receivedContactId;
  const exists = await verifyWhatsAppNumber({
    async checkNumberStatus(contactId) {
      receivedContactId = contactId;
      return { numberExists: true, canReceiveMessage: true };
    },
  }, "51992387729");

  assert.equal(receivedContactId, "51992387729@c.us");
  assert.equal(exists, true);
});

test("reporta una incompatibilidad controlada si falta el método de WPPConnect", async () => {
  await assert.rejects(
    verifyWhatsAppNumber({}, "51992387729"),
    /no admite verificación de números/,
  );
});
