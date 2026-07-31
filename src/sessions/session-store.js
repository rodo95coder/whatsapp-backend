// src/sessions/session-store.js

import { SessionRuntime } from "./session-runtime.js";
import { normalizeCompanyId } from "../utils/company-id.js";

const runtimes = new Map();

export function getRuntime(companyId) {
  return runtimes.get(normalizeCompanyId(companyId));
}

export function createRuntime(companyId) {
  const normalizedId = normalizeCompanyId(companyId);

  if (!runtimes.has(normalizedId)) {
    runtimes.set(normalizedId, new SessionRuntime(normalizedId));
  }

  return runtimes.get(normalizedId);
}

export function removeRuntime(companyId) {
  runtimes.delete(normalizeCompanyId(companyId));
}

export function isCurrentRuntime(companyId, runtime) {
  return getRuntime(companyId) === runtime;
}

export function hasRuntime(companyId) {
  return runtimes.has(normalizeCompanyId(companyId));
}

export function getAllRuntimes() {
  return Array.from(runtimes.values());
}

export function forEachRuntime(callback) {
  for (const runtime of runtimes.values()) {
    callback(runtime);
  }
}

export default Object.freeze({
  getRuntime,
  createRuntime,
  removeRuntime,
  isCurrentRuntime,
  hasRuntime,
  getAllRuntimes,
  forEachRuntime,
});
