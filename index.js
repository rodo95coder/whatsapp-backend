import 'dotenv/config';
import app from './src/app.js';
import config from './src/config/env.js';
import { restoreSessionsOnBoot } from './src/services/session.service.js';

const { port } = config;
const HOST = '0.0.0.0';

app.listen(port, HOST, async () => {
  console.log(`Servidor WhatsApp API en ${HOST}:${port}`);
  await restoreSessionsOnBoot();
});