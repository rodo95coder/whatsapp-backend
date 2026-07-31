// src/services/file.js

import fs from "fs-extra";
import path from "path";
import axios from "axios";
import crypto from "crypto";

import config from "../config/env.js";
import { assertSafeHttpUrl, safeLookup } from "../utils/url-security.js";

const { tempPath } = config;

const MAX_FILE_SIZE = 10 * 1024 * 1024;

fs.ensureDirSync(tempPath);

function sanitizeFileName(filename) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function generateTempName(filename) {
  const safeName = sanitizeFileName(filename);

  return `${Date.now()}_${crypto.randomUUID()}_${safeName}`;
}

export async function saveBase64ToFile(base64, filename) {
  const estimatedSize = (base64.length * 3) / 4;

  if (estimatedSize > MAX_FILE_SIZE) {
    throw new Error("Archivo demasiado grande");
  }

  const buffer = Buffer.from(base64, "base64");

  const full = path.join(tempPath, generateTempName(filename));

  await fs.writeFile(full, buffer);

  return full;
}

export async function downloadToFile(url, filename) {
  await assertSafeHttpUrl(url);

  const full = path.join(tempPath, generateTempName(filename));

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",

    timeout: 15000,

    maxContentLength: MAX_FILE_SIZE,
    maxBodyLength: MAX_FILE_SIZE,
    lookup: safeLookup,

    validateStatus(status) {
      return status >= 200 && status < 300;
    },
  });

  const writer = fs.createWriteStream(full);

  let totalSize = 0;

  return new Promise((resolve, reject) => {
    response.data.on("data", (chunk) => {
      totalSize += chunk.length;

      if (totalSize > MAX_FILE_SIZE) {
        response.data.destroy();
        writer.destroy();

        fs.remove(full).catch(() => {});

        reject(new Error("Archivo demasiado grande"));
      }
    });

    response.data.on("error", (err) => {
      reject(err);
    });

    writer.on("error", (err) => {
      reject(err);
    });

    writer.on("finish", () => {
      resolve(full);
    });

    response.data.pipe(writer);
  });
}

setInterval(
  async () => {
    try {
      const files = await fs.readdir(tempPath);

      const now = Date.now();

      for (const file of files) {
        const full = path.join(tempPath, file);

        try {
          const stats = await fs.stat(full);

          const age = now - stats.mtimeMs;

          if (age > 10 * 60 * 1000) {
            await fs.remove(full);
          }
        } catch (cleanupError) {
          console.warn("Error revisando temporal:", cleanupError.message);
        }
      }
    } catch (err) {
      console.warn("Error limpiando temporales:", err.message);
    }
  },
  5 * 60 * 1000,
);

export default {
  saveBase64ToFile,
  downloadToFile,
};
