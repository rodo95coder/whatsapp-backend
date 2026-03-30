// src/services/file.js
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import config from '../config/env.js';
const { tempPath } = config;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

fs.ensureDirSync(tempPath);

export async function saveBase64ToFile(base64, filename) {
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.length > 10 * 1024 * 1024) {
  throw new Error("Archivo demasiado grande");
  }

  const safe = `${Date.now()}_${filename}`;
  const full = path.join(tempPath, safe);
  await fs.writeFile(full, buffer);
  return full;
}

export async function downloadToFile(url, filename) {
  if (!url.startsWith('http')) {
  throw new Error('Invalid URL');
}

  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const safe = `${Date.now()}_${safeName}`;
  const full = path.join(tempPath, safe);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    maxContentLength: MAX_FILE_SIZE,
    maxBodyLength: MAX_FILE_SIZE
  });
  

  const writer = fs.createWriteStream(full);
  let totalSize = 0;

  response.data.on('data', (chunk) => {
    totalSize += chunk.length;

    if (totalSize > MAX_FILE_SIZE) {
      writer.destroy();
      response.data.destroy();
      throw new Error('Archivo demasiado grande');
    }
  });

  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(full));
    writer.on('error', reject);
  });
}

setInterval(async () => {
  try {
    const files = await fs.readdir(tempPath);
    const now = Date.now();

    for (const file of files) {
      const full = path.join(tempPath, file);
      const stats = await fs.stat(full);

      // borrar archivos > 10 min
      if (now - stats.mtimeMs > 10 * 60 * 1000) {
        await fs.remove(full);
      }
    }
  } catch (err) {
  console.warn('Error limpiando archivos temporales:', err.message);}
}, 5 * 60 * 1000);

export default {
  saveBase64ToFile,
  downloadToFile
};