// src/controllers/extraController.js
import sessionManager from "../services/session.service.js";
import { parseTemplate } from "../services/template.js";

export async function verifyNumber(req, res) {
  const { companyId, number } = req.body;

  const client = sessionManager.clients[companyId];

  if (!client) {
    return res.status(400).json({
      success: false,
      msg: "Session not active"
    });
  }

  try {
    const exists = await client.isRegisteredUser(number);

    res.json({
      success: true,
      exists
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      msg: e.message
    });
  }
}

export async function sendBulk(req, res) {
  const { companyId, list, text } = req.body;

  const results = [];

  for (const num of list) {
    const r = await sessionManager.sendMessage({
      companyId,
      numbers: [num],
      text
    });

    results.push({
      numero: num,
      result: r
    });
  }

  res.json({
    success: true,
    results
  });
}

export async function sendTemplate(req, res) {
  const { companyId, number, templateKey, params } = req.body;

  const text = await parseTemplate(templateKey, params);

  const r = await sessionManager.sendMessage({
    companyId,
    numbers: [number],
    text
  });

  res.json(r);
}