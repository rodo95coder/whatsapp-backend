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

// Manejador global de promesas rechazadas no capturadas
process.on('unhandledRejection', (reason, promise) => {
  // Verificar si es el error de conexión que ya conocemos
  if (reason?.message?.includes('Connection closed') || 
      reason?.message?.includes('Auto Close Called')) {
    // Solo loguear como debug, no como error
    console.debug('Error esperado durante limpieza:', reason.message);
  } else {
    // Si es otro error, loguearlo completo
    console.error('Unhandled Rejection:', reason);
  }
});

// Manejador de excepciones no capturadas
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

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
// Error handler (siempre al final)
app.use(errorHandler);

export default app;