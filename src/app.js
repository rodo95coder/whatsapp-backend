// src/app.js

import express from "express";
import cors from "cors";
import { json, urlencoded } from "express";
import rateLimit from "express-rate-limit";

import config from "./config/env.js";
import routes from "./routes/index.js";
import errorHandler from "./middlewares/error.js";

const { clientMaxBodySize } = config;

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
});

const app = express();

app.use(
  cors({
    origin: true,
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
  }),
);

app.use("/api", limiter);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
  });
});

app.use("/api", routes);

app.use(errorHandler);

export default app;