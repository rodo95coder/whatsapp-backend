const fs = require("fs-extra");
const path = require("path");
const { sessionsPath } = require("../config/env.js");

function webhookFile(companyId) {
  return path.join(sessionsPath, String(companyId), "webhook.json");
}

async function setWebhook(req, res) {
  const { companyId } = req.params;
  const { url } = req.body;

  if (!url)
    return res.status(400).json({ success: false, msg: "Falta 'url'" });

  const file = webhookFile(companyId);

  fs.ensureDirSync(path.dirname(file));
  await fs.writeJson(file, { url }, { spaces: 2 });

  return res.json({ success: true, msg: "Webhook configurado", url });
}

async function getWebhook(req, res) {
  const { companyId } = req.params;
  const file = webhookFile(companyId);

  if (!fs.existsSync(file))
    return res.json({ success: false, msg: "Webhook no configurado" });

  const data = await fs.readJson(file);
  return res.json({ success: true, url: data.url });
}

module.exports = { setWebhook, getWebhook };
