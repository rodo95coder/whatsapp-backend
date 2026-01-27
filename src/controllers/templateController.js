const { sendMessage } = require("../services/session-manager.js");
const { parseTemplate } = require("../services/template.js");

async function sendTemplate(req, res) {
  const { companyId } = req.params;
  const { numbers, templateKey, params } = req.body;

  if (!templateKey)
    return res.status(400).json({ success: false, msg: "Falta templateKey" });

  const text = await parseTemplate(templateKey, params);

  const result = await sendMessage({ companyId, numbers, text });
  return res.json(result);
}

module.exports = { sendTemplate };
