// src/middlewares/validateCompanyId.js
import { normalizeCompanyId, isValidCompanyId } from "../utils/company-id.js";

export function validateCompanyId(req, res, next) {
  const companyId = req.params.companyId ?? req.body.companyId;
  const cleanCompanyId = normalizeCompanyId(companyId);

  if (!cleanCompanyId) {
    return res.status(400).json({
      success: false,
      message: "companyId no puede estar vacío",
    });
  }

  if (!isValidCompanyId(cleanCompanyId)) {
    return res.status(400).json({
      success: false,
      message:
        "companyId debe tener entre 3 y 50 caracteres y solo puede contener letras, números, guiones y underscores",
    });
  }

  req.cleanCompanyId = cleanCompanyId;

  return next();
}
