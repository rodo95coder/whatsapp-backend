// clean-sessions.js
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionsPath = path.join(__dirname, 'sessions');

console.log('Limpiando directorio de sesiones...');

if (!fs.existsSync(sessionsPath)) {
  console.log('No existe directorio de sesiones');
  process.exit(0);
}

// Carpetas que NO son sesiones válidas
const INVALID_FOLDERS = [
  'component_crx_cache',
  'Crashpad',
  'Default',
  'GrShaderCache',
  'ShaderCache',
  'BrowserMetrics-spare.pma'
];

const folders = fs.readdirSync(sessionsPath);

folders.forEach(folder => {
  const folderPath = path.join(sessionsPath, folder);

  // eliminar basura conocida
  if (INVALID_FOLDERS.includes(folder)) {
    console.log(` Eliminando basura: ${folder}`);
    fs.removeSync(folderPath);
    return;
  }

  // eliminar nombres vacíos o inválidos
  if (!folder || folder.trim() === '') {
    console.log(' Eliminando carpeta inválida (vacía)');
    fs.removeSync(folderPath);
    return;
  }

  // eliminar archivos sueltos (no carpetas)
  if (!fs.statSync(folderPath).isDirectory()) {
    console.log(` Eliminando archivo suelto: ${folder}`);
    fs.removeSync(folderPath);
    return;
  }

  // validar que tenga estructura de sesión
  const chromePath = path.join(folderPath, 'chrome');

  if (!fs.existsSync(chromePath)) {
    console.log(` Carpeta inválida (sin chrome): ${folder} → eliminando`);
    fs.removeSync(folderPath);
    return;
  }

  // mantener sesión válida
  console.log(`Manteniendo sesión: ${folder}`);
});

console.log('Limpieza completada');