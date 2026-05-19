// src/app.js
import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'express';
import config from './config/env.js';
import routes from './routes/index.js';
import errorHandler from './middlewares/error.js';
import rateLimit from 'express-rate-limit';

const { clientMaxBodySize } = config;

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});

const app = express();

// Middlewares
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Global-Token']
}));

app.use(json({ limit: clientMaxBodySize }));
app.use(urlencoded({ extended: true }));
app.use('/api', limiter);
// Healthcheck simple
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime()
  });
});

// Rutas principales
app.use('/api', routes);
// Error handler 
app.use(errorHandler);

export default app;