//utils/file-handler.js
import multer from "multer";
import { ENV } from "../config/env-config.js";

const storage = multer.diskStorage({
  destination: ENV.TMP_MEDIA,
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage }).single("file");

export const handleFileUpload = (req) =>
  new Promise((resolve, reject) => {
    upload(req, null, (err) => {
      if (err) reject(err);
      resolve({
        filePath: req.file.path,
        fileName: req.file.filename
      });
    });
  });
