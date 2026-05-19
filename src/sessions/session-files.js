import fs from "fs-extra";
import path from "path";
import config from "../config/env.js";

const { sessionsPath } = config;

export function companyFolder(companyId) {
  return path.join(sessionsPath, String(companyId));
}

export function ensureCompanyFolder(companyId) {
  const folder = companyFolder(companyId);
  fs.ensureDirSync(folder);
  return folder;
}

export function readWebhookUrl(companyId) {
  try {
    const cfg = fs.readJsonSync(
      path.join(companyFolder(companyId), "webhook.json"),
      { throws: false }
    );

    return cfg?.url || null;
  } catch {
    return null;
  }
}