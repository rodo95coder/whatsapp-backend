// src/app.js

import express from "express";
import cors from "cors";
import { json, urlencoded } from "express";
import rateLimit from "express-rate-limit";

import config from "./config/env.js";
import routes from "./routes/index.js";
import errorHandler from "./middlewares/error.js";
import requestObservability from "./middlewares/request-observability.js";
import store from "./sessions/session-store.js";
import { getWebhookQueueStats } from "./services/webhook-delivery-queue.js";

const { clientMaxBodySize, corsOrigins } = config;

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function corsOrigin(origin, callback) {
  // Preserve current server-to-server behavior until CORS_ORIGINS is set.
  if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error("Origen CORS no permitido"));
}

const app = express();

app.use(requestObservability);

app.use(
  cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Global-Token",
    ],
  }),
);

app.use(json({ limit: clientMaxBodySize }));

app.use(
  urlencoded({
    extended: true,
    limit: clientMaxBodySize,
  }),
);

app.use("/api", limiter);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
  });
});

app.get("/readyz", (req, res) => {
  const runtimes = store.getAllRuntimes();
  res.json({
    ok: true,
    uptime: process.uptime(),
    sessions: {
      total: runtimes.length,
      connected: runtimes.filter((runtime) => runtime.state === "CONNECTED").length,
      connecting: runtimes.filter((runtime) => runtime.state === "CONNECTING").length,
    },
    webhooks: getWebhookQueueStats(),
  });
});

app.use("/api", routes);

app.use(errorHandler);

export default app;
