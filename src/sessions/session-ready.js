// src/sessions/session-ready.js

import fs from "fs-extra";
import path from "path";

import config from "../config/env.js";

export function sessionReadyFile(companyId) {
  return path.join(config.sessionsPath, companyId, "session-ready.json");
}

export async function markSessionReady(companyId) {
  await fs.ensureDir(path.join(config.sessionsPath, companyId));

  await fs.writeJson(
    sessionReadyFile(companyId),
    {
      companyId,
      connectedAt: new Date().toISOString(),
    },
    { spaces: 2 },
  );
}

export async function hasSessionReadyMarker(companyId) {
  return fs.pathExists(sessionReadyFile(companyId));
}
