// src/controllers/extraController.js

import sessionManager from "../services/session.service.js";
import { parseTemplate } from "../services/template.js";
import { verifyWhatsAppNumber } from "../services/number-verification.js";
import logger from "../utils/logger.js";

export async function verifyNumber(req, res) {
  try {
    const companyId = req.cleanCompanyId;
    const { number } = req.body;

    if (!number) {
      return res.status(400).json({
        success: false,
        message: "number requerido",
      });
    }

    const client = sessionManager.getClient(companyId);

    if (!client) {
      return res.status(400).json({
        success: false,
        message: "Session not active",
      });
    }

    const exists = await verifyWhatsAppNumber(client, number);

    return res.json({
      success: true,
      exists,
    });

  } catch (err) {
    logger.error(
      `[${req.cleanCompanyId}] verifyNumber: ${err.message}`,
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function sendBulk(req, res) {
  try {
    const companyId = req.cleanCompanyId;
    const { list, text } = req.body;

    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({
        success: false,
        message: "list debe ser array",
      });
    }

    const result = await sessionManager.sendMessage({
      companyId,
      numbers: list,
      text,
    });

    return res.json(result);

  } catch (err) {
    logger.error(
      `[${req.cleanCompanyId}] sendBulk: ${err.message}`,
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function sendTemplate(req, res) {
  try {
    const companyId = req.cleanCompanyId;
    const { number, templateKey, params } = req.body;

    if (!number || !templateKey) {
      return res.status(400).json({
        success: false,
        message: "number y templateKey requeridos",
      });
    }

    const text = await parseTemplate(templateKey, params);

    const result = await sessionManager.sendMessage({
      companyId,
      numbers: [number],
      text,
    });

    return res.json(result);

  } catch (err) {
    logger.error(
      `[${req.cleanCompanyId}] sendTemplate: ${err.message}`,
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
