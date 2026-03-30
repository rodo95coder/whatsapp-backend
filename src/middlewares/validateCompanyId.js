// src/middlewares/validateCompanyId.js

export const validateCompanyId = (req, res, next) => {
  // SIEMPRE priorizar params si existen
  let companyId;
  let source;
  
  if (req.params.companyId) {
    companyId = req.params.companyId;
    source = 'params';
  } else {
    companyId = req.body.companyId;
    source = 'body';
  }
  
  // Log para debug
  console.log(`[${req.method}] ${req.path} - companyId desde ${source}:`, companyId);
  
  // Si vino por body pero también hay params, warning (útil para detectar errores)
  if (req.params.companyId && req.body.companyId) {
    console.warn(`ADVERTENCIA: companyId en body (${req.body.companyId}) ignorado, usando params: ${req.params.companyId}`);
  }
  
  const errors = [];
  
  if (!companyId) {
    errors.push("companyId es requerido");
  } else if (typeof companyId !== 'string') {
    errors.push("companyId debe ser un texto");
  } else {
    const trimmed = companyId.trim();
    
    if (trimmed === '') {
      errors.push("companyId no puede estar vacío");
    } else if (trimmed.length < 3) {
      errors.push("companyId debe tener al menos 3 caracteres");
    } else if (trimmed.length > 50) {
      errors.push("companyId no puede exceder 50 caracteres");
    } else if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      errors.push("companyId solo puede contener letras, números, guiones y underscores");
    } else {
      req.cleanCompanyId = trimmed;
      return next();
    }
  }
  
  return res.status(400).json({
    success: false,
    errors,
    source // Útil para debug
  });
};