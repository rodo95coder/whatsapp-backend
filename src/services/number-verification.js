function normalizeContactId(number) {
  const digits = String(number || "").replace(/\D/g, "");

  if (digits.length < 8 || digits.length > 20) {
    throw new Error("number inválido");
  }

  return `${digits}@c.us`;
}

export async function verifyWhatsAppNumber(client, number) {
  if (typeof client?.checkNumberStatus !== "function") {
    throw new Error("La sesión no admite verificación de números con la versión actual de WPPConnect");
  }

  const profile = await client.checkNumberStatus(normalizeContactId(number));
  return Boolean(profile?.numberExists);
}

export { normalizeContactId };
