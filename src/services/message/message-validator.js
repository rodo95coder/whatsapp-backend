// src/services/message/message-validator.js

export async function validateSendRequest(req, res) {
  const { companyId, numbers, text, base64File, fileUrl } = req.body;

  // Validaciones
  if (!companyId) {
    return res.status(400).json({ message: "companyId requerido" });
  }

  if (!numbers || !Array.isArray(numbers)) {
    return res.status(400).json({ message: "numbers debe ser array" });
  }

  if (!text && !base64File && !fileUrl) {
    return res.status(400).json({
      success: false,
      message: "Debe proporcionar text, base64File o fileUrl",
    });
  }
}
