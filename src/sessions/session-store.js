// src/sessions/session-store.js

import { SessionRuntime } from "./session-runtime.js";

const runtimes = new Map();

export function getRuntime(companyId) {
  return runtimes.get(companyId);
}

export function createRuntime(companyId) {
  if (!runtimes.has(companyId)) {
    runtimes.set(
      companyId,
      new SessionRuntime(companyId)
    );
  }

  return runtimes.get(companyId);
}

export function removeRuntime(companyId) {
  runtimes.delete(companyId);
}

export function hasRuntime(companyId) {
  return runtimes.has(companyId);
}

export function getAllRuntimes() {
  return runtimes;
}

export default {
  runtimes,
  getRuntime,
  createRuntime,
  removeRuntime,
  hasRuntime,
  getAllRuntimes,
};