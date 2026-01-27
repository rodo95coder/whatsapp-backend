// index.js
import 'dotenv/config';
import app from './src/app.js';
import config from './src/config/env.js';
const { port } = config;

const HOST = '0.0.0.0';
app.listen(port, HOST, () =>
  console.log(`Servidor WhatsApp API en ${HOST}:${port} - NODE_ENV=${process.env.NODE_ENV || 'development'}`)
);
