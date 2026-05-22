// src/middlewares/validateToken.js

import config from "../config/env.js";

const { globalToken } = config;

export default function validateToken(req, res, next) {
  const authorization = req.headers.authorization || "";
  const globalHeader = req.headers["x-global-token"] || "";

  let token = "";

  if (
    typeof authorization === "string" &&
    authorization.startsWith("Bearer ")
  ) {
    token = authorization.slice("Bearer ".length).trim();
  } else if (typeof globalHeader === "string") {
    token = globalHeader.trim();
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token requerido",
    });
  }

  if (token !== globalToken) {
    return res.status(403).json({
      success: false,
      message: "Token inválido",
    });
  }

  return next();
}
