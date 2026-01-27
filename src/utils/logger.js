// src/utils/logger.js
import winston from "winston";
import config from '../config/env.js';
const { logLevel } = config;

const { combine, timestamp, printf, colorize } = winston.format;

// Formato personalizado
const myFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}] ${message}`;
});

// Crear UN solo logger (no dos como tenías)
const logger = winston.createLogger({
  level: logLevel || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    myFormat
  ),
  transports: [
    // Consola con colores
    new winston.transports.Console({
      format: combine(
        colorize(),
        myFormat
      )
    }),
    // Archivo para todos los logs
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Archivo solo para errores
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// Métodos helpers (opcionales, para uso rápido)
export const log = (...msg) => {
  logger.info(msg.join(' '));
};

export const error = (...msg) => {
  logger.error(msg.join(' '));
};

export const warn = (...msg) => {
  logger.warn(msg.join(' '));
};

export const debug = (...msg) => {
  logger.debug(msg.join(' '));
};

// Exportar el logger principal como default
export default logger;