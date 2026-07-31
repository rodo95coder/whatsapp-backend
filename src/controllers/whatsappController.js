// src/controllers/whatsappController.js

import fs from "fs-extra";

import sessionManager from "../services/session.service.js";
import logger from "../utils/logger.js";
import { saveBase64ToFile, downloadToFile } from "../services/file.js";

export const initSession = async (req, res) => {
  try {
    const companyId = req.cleanCompanyId;

    const result = await sessionManager.initSession(companyId);

    return res.json(result);
  } catch (err) {
    logger.error(`[${req.cleanCompanyId}] initSession: ${err.message}`);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const getQR = async (req, res) => {
  try {
    const companyId = req.cleanCompanyId;
    const qr = sessionManager.getQR(companyId);

    if (!qr) {
      return res.status(404).json({
        success: false,
        message: "QR no disponible",
      });
    }

    const match = qr.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);

    if (!match) {
      return res.json({
        success: true,
        data: {
          qrCode: qr,
          companyId,
        },
      });
    }

    return res.json({
      success: true,
      data: {
        qrCode: match[2],
        format: match[1],
        mimeType: `image/${match[1]}`,
        companyId,
      },
    });
  } catch (err) {
    logger.error(`[${req.cleanCompanyId}] getQR: ${err.message}`);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const getStatus = async (req, res) => {
  try {
    const companyId = req.cleanCompanyId;
    const status = sessionManager.getStatus(companyId);

    return res.json({
      success: true,
      ...status,
    });
  } catch (err) {
    logger.error(`[${req.cleanCompanyId}] getStatus: ${err.message}`);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

async function prepareFileFromBody(req) {
  const { base64File, fileUrl, fileName } = req.body;

  if (!base64File && !fileUrl) {
    return {
      filePath: null,
      fileName: null,
    };
  }

  if (!fileName) {
    throw new Error("fileName requerido para enviar archivo");
  }

  if (base64File) {
    const cleanBase64 = String(base64File).replace(/^data:.*?;base64,/, "");

    const filePath = await saveBase64ToFile(cleanBase64, fileName);

    return {
      filePath,
      fileName,
    };
  }

  const filePath = await downloadToFile(fileUrl, fileName);

  return {
    filePath,
    fileName,
  };
}

export const send = async (req, res) => {
  let tempFilePath = null;

  try {
    const companyId = req.cleanCompanyId;
    const { numbers, text } = req.body;

    const preparedFile = await prepareFileFromBody(req);

    tempFilePath = preparedFile.filePath;

    const result = await sessionManager.sendMessage({
      companyId,
      numbers,
      text,
      filePath: preparedFile.filePath,
      fileName: preparedFile.fileName,
    });

    return res.json(result);
  } catch (err) {
    logger.error(`[${req.cleanCompanyId}] send: ${err.message}`);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (tempFilePath) {
      try {
        await fs.remove(tempFilePath);
      } catch (cleanupErr) {
        logger.warn(
          `[${req.cleanCompanyId}] cleanup temp file: ${cleanupErr.message}`,
        );
      }
    }
  }
};

export const logout = async (req, res) => {
  try {
    const companyId = req.cleanCompanyId;

    const result = await sessionManager.logout(companyId);

    return res.json({
      success: result.success,
      message: result.msg,
      companyId,
    });
  } catch (err) {
    logger.error(`[${req.cleanCompanyId}] logout: ${err.message}`);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const forceReset = async (req, res) => {
  try {
    const companyId = req.cleanCompanyId;
    const { deleteAuth = false, deleteSessionMetadata = false, restart = false } = req.body;

    if (![deleteAuth, deleteSessionMetadata, restart].every((value) => typeof value === "boolean")) {
      return res.status(400).json({ success: false, message: "Las opciones deben ser booleanas" });
    }

    const result = await sessionManager.forceReset(companyId, {
      deleteAuth,
      deleteSessionMetadata,
      restart,
    });

    return res.json({ success: true, companyId, ...result });
  } catch (err) {
    logger.error(`[${req.cleanCompanyId}] forceReset: ${err.message}`);
    return res.status(500).json({ success: false, message: "No se pudo reiniciar la sesiÃ³n" });
  }
};
