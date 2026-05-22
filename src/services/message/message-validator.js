// src/services/message/message-validator.js

const MAX_NUMBERS = 100;
const MAX_TEXT_LENGTH = 5000;
const MAX_BASE64_SIZE = 15 * 1024 * 1024;

function normalizeNumber(number) {
  return String(number)
    .replace(/\D/g, "")
    .trim();
}

export function validateSendRequest(body) {
  const {
    companyId,
    numbers,
    text,
    base64File,
    fileUrl,
  } = body;

  // =========================
  // COMPANY
  // =========================

  if (!companyId) {
    throw new Error("companyId requerido");
  }

  // =========================
  // NUMBERS
  // =========================

  if (!Array.isArray(numbers)) {
    throw new Error("numbers debe ser array");
  }

  if (numbers.length === 0) {
    throw new Error("numbers vacío");
  }

  if (numbers.length > MAX_NUMBERS) {
    throw new Error(`Máximo ${MAX_NUMBERS} números`);
  }

  const normalizedNumbers = [
    ...new Set(
      numbers
        .map(normalizeNumber)
        .filter((n) => n.length >= 8),
    ),
  ];

  if (normalizedNumbers.length === 0) {
    throw new Error("No hay números válidos");
  }

  // =========================
  // CONTENT
  // =========================

  if (!text && !base64File && !fileUrl) {
    throw new Error(
      "Debe proporcionar text, base64File o fileUrl",
    );
  }

  // =========================
  // TEXT
  // =========================

  if (text && typeof text !== "string") {
    throw new Error("text inválido");
  }

  if (text && text.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `Texto excede ${MAX_TEXT_LENGTH} caracteres`,
    );
  }

  // =========================
  // BASE64
  // =========================

  if (base64File) {
    if (typeof base64File !== "string") {
      throw new Error("base64File inválido");
    }

    const size = Buffer.byteLength(base64File, "base64");

    if (size > MAX_BASE64_SIZE) {
      throw new Error("Archivo demasiado grande");
    }
  }

  // =========================
  // FILE URL
  // =========================

  if (fileUrl) {
    try {
      new URL(fileUrl);
    } catch {
      throw new Error("fileUrl inválida");
    }
  }

  return {
    companyId: String(companyId),
    numbers: normalizedNumbers,
    text: text || "",
    base64File: base64File || null,
    fileUrl: fileUrl || null,
  };
}