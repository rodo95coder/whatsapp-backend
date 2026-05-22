// src/controllers/templateController.js

import { parseTemplate } from "../services/template.js";

export async function sendTemplate(req, res) {
  const { companyId } = req.params;
  const { numbers, templateKey, params } = req.body;

  if (!templateKey) {
    return res.status(400).json({
      success: false,
      msg: "Falta templateKey"
    });
  }

  const text = await parseTemplate(templateKey, params);

 

  return res.json();
}