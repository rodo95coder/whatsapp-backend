import fs from "fs";
import { ENV } from "../config/env-config.js";

export const getSessions = () => {
  if (!fs.existsSync(ENV.MULTI_SESSION_PATH)) return {};
  return JSON.parse(fs.readFileSync(ENV.MULTI_SESSION_PATH));
};

export const saveSessions = (data) => {
  fs.writeFileSync(ENV.MULTI_SESSION_PATH, JSON.stringify(data, null, 2));
};
