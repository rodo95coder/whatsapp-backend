// src/utils/file-handler.js

import multer from "multer";
import path from "path";
import crypto from "crypto";

import config from "../config/env.js";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "video/mp4",
  "audio/mpeg",
];

function sanitizeFileName(name) {
  return path
    .basename(name)
    .replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

const storage = multer.diskStorage({
  destination: config.tempPath,

  filename: (req, file, cb) => {
    const safeName = sanitizeFileName(
      file.originalname,
    );

    const uniqueName =
      `${Date.now()}-` +
      `${crypto.randomUUID()}-` +
      safeName;

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE,
  },

  fileFilter: (req, file, cb) => {
    if (
      !ALLOWED_MIME_TYPES.includes(file.mimetype)
    ) {
      return cb(
        new Error("Tipo de archivo no permitido"),
      );
    }

    cb(null, true);
  },
}).single("file");

export function handleFileUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) {
        reject(err);
        return;
      }

      if (!req.file) {
        reject(new Error("Archivo requerido"));
        return;
      }

      resolve({
        filePath: req.file.path,
        fileName: req.file.filename,
      });
    });
  });
}