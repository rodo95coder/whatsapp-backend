// src/services/message/message-file-handler.js

import fs from "fs/promises";
import fileService from "../file.js";

export async function prepareMessageFile({
  companyId,
  base64File,
  fileUrl,
  fileName,
}) {
  let filePath = null;

  if (!fileName) {
    throw new Error("fileName requerido");
  }

  // =========================
  // BASE64
  // =========================

  if (base64File) {
    filePath = await fileService.saveBase64ToFile(
      base64File,
      fileName,
    );

    console.log(
      `[${companyId}] Archivo base64 guardado`,
    );

    return filePath;
  }

  // =========================
  // URL
  // =========================

  if (fileUrl) {
    filePath = await fileService.downloadToFile(
      fileUrl,
      fileName,
    );

    console.log(
      `[${companyId}] Archivo descargado`,
    );

    return filePath;
  }

  throw new Error(
    "Debe proporcionar base64File o fileUrl",
  );
}

export async function cleanupTempFile(
  filePath,
  companyId,
) {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);

    console.log(
      `[${companyId}] Archivo temporal eliminado`,
    );

  } catch (err) {

    console.warn(
      `[${companyId}] Error eliminando archivo temporal: ${err.message}`,
    );
  }
}
