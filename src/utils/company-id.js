// src/utils/company-id.js

export const COMPANY_ID_REGEX = /^[a-zA-Z0-9_-]{3,50}$/;

export function normalizeCompanyId(companyId) {
  if (companyId === null || companyId === undefined) {
    return null;
  }

  return String(companyId).trim();
}

export function isValidCompanyId(companyId) {
  const normalized = normalizeCompanyId(companyId);

  if (!normalized) {
    return false;
  }

  return COMPANY_ID_REGEX.test(normalized);
}

export function assertValidCompanyId(companyId) {
  const normalized = normalizeCompanyId(companyId);

  if (!isValidCompanyId(normalized)) {
    throw new Error("companyId inválido");
  }

  return normalized;
}
