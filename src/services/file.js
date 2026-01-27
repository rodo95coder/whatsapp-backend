// src/services/file.js
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import config from '../config/env.js';
const { tempPath } = config;

fs.ensureDirSync(tempPath);

export async function saveBase64ToFile(base64, filename) {
  const buffer = Buffer.from(base64, 'base64');
  const safe = `${Date.now()}_${filename}`;
  const full = path.join(tempPath, safe);
  await fs.writeFile(full, buffer);
  return full;
}

export async function downloadToFile(url, filename) {
  const safe = `${Date.now()}_${filename}`;
  const full = path.join(tempPath, safe);
  const writer = fs.createWriteStream(full);
  const response = await axios({ 
    url, 
    method: 'GET', 
    responseType: 'stream' 
  });
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(full));
    writer.on('error', reject);
  });
}

export default {
  saveBase64ToFile,
  downloadToFile
};