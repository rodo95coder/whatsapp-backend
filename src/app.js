// src/app.js
import express from 'express';
import cors from 'cors';
import whatsappRoutes from './routes/whatsappRoutes.js';
import validateToken from './middlewares/validateToken.js';
import { json, urlencoded } from 'express';
import config from './config/env.js';
const { clientMaxBodySize } = config;
import { restoreSessionsOnBoot } from './services/session-manager.js';
import errorHandler from './middlewares/error.js';

const app = express();

// Middlewares
app.use(cors({
  origin: true, // en producción, limita a tu dominio: ['https://mi-dominio.com']
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Global-Token']
}));
app.use(json({ limit: clientMaxBodySize }));
app.use(urlencoded({ extended: true }));
(async () => {  await restoreSessionsOnBoot();})();

// Rutas públicas mínimas (si necesitas healthcheck)
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Middleware auth para /api
app.use('/api', validateToken, whatsappRoutes);

// Error handler (último)
app.use(errorHandler);

export default app;
