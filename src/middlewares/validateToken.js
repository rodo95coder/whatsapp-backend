// src/middlewares/validateToken.js
import config from '../config/env.js';
const { globalToken } = config;

export default function validateToken(req, res, next) {
  // Preferimos Authorization: Bearer <token>
  const auth = req.headers.authorization || req.headers['x-global-token'] || '';

  let token = null;
  if (typeof auth === 'string') {
    if (auth.startsWith('Bearer ')) token = auth.split(' ')[1];
    else token = auth; // permite header x-global-token: <token>
  }

  if (!token) {
    return res.status(401).json({ success: false, msg: 'Token requerido' });
  }

  if (token !== globalToken) {
    return res.status(403).json({ success: false, msg: 'Token inválido' });
  }

  return next();
}
