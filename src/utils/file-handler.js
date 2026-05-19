//utils/file-handler.js
import multer from "multer";
import config from "../config/env.js";

const storage = multer.diskStorage({
  destination: config.tempPath,
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
