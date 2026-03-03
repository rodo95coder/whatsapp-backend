// src/controllers/webhookController.js

import fs from "fs-extra";
import path from "path";
import config from "../config/env.js";

const { sessionsPath } = config;

function webhookFile(companyId) {
  return path.join(sessionsPath, String(companyId), "webhook.json");
}

export async function setWebhook(req, res) {
  const { companyId } = req.params;
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      msg: "Falta 'url'"
    });
  }

  const file = webhookFile(companyId);

  await fs.ensureDir(path.dirname(file));
  await fs.writeJson(file, { url }, { spaces: 2 });

  return res.json({
    success: true,
    msg: "Webhook configurado",
    url
  });
}

export async function getWebhook(req, res) {
  const { companyId } = req.params;
  const file = webhookFile(companyId);

  if (!(await fs.pathExists(file))) {
    return res.json({
      success: false,
      msg: "Webhook no configurado"
    });
  }

  const data = await fs.readJson(file);

  return res.json({
    success: true,
    url: data.url
  });
}