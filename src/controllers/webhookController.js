// src/controllers/webhookController.js

import fs from "fs-extra";
import path from "path";

import config from "../config/env.js";
import logger from "../utils/logger.js";
import { assertSafeHttpUrl } from "../utils/url-security.js";

const { sessionsPath } = config;

function webhookFile(companyId) {
  return path.join(sessionsPath, String(companyId), "webhook.json");
}

export async function setWebhook(req, res) {
  try {
    const companyId = req.cleanCompanyId;
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: "URL de webhook inválida",
      });
    }

    await assertSafeHttpUrl(url);

    const file = webhookFile(companyId);

    await fs.ensureDir(path.dirname(file));

    await fs.writeJson(
      file,
      {
        url,
        updatedAt: new Date().toISOString(),
      },
      { spaces: 2 },
    );

    return res.json({
      success: true,
      message: "Webhook configurado",
      url,
    });
  } catch (err) {
    logger.error(`[${req.cleanCompanyId}] setWebhook: ${err.message}`);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getWebhook(req, res) {
  try {
    const companyId = req.cleanCompanyId;
    const file = webhookFile(companyId);

    if (!(await fs.pathExists(file))) {
      return res.json({
        success: false,
        message: "Webhook no configurado",
      });
    }

    const data = await fs.readJson(file);

    return res.json({
      success: true,
      url: data.url,
      updatedAt: data.updatedAt || null,
    });
  } catch (err) {
    logger.error(`[${req.cleanCompanyId}] getWebhook: ${err.message}`);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
