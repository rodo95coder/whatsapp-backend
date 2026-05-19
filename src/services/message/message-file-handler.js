// src/services/message/message-file-handler.js

import fs from "fs";
import fileService from "../services/file.js";

export async function prepareMessageFile(base64File, fileName, req) {
  const companyId = req.cleanCompanyId;
  const { fileUrl } = req.body;
  let filePath = null;
  if (!base64File || !fileName) {
    throw new Error("base64File y fileName son requeridos");
  }

  // Procesar archivo si existe
  if (base64File && fileName) {
    filePath = await fileService.saveBase64ToFile(base64File, fileName);
    console.log(`[${companyId}] Archivo guardado:`, filePath);
  } else if (fileUrl && fileName) {
    filePath = await fileService.downloadToFile(fileUrl, fileName);
    console.log(`[${companyId}] Archivo descargado:`, filePath);
  }
  return filePath;
}

export function cleanupTempFile(filePath, companyId) {
  if (filePath) {
    try {
      fs.unlinkSync(filePath);
      console.log(`[${companyId}] Archivo temporal eliminado: ${filePath}`);
    } catch (error) {
      console.warn(
        `[${companyId}] No se pudo eliminar archivo temporal: ${error.message}`,
      );
    }
  }
}
