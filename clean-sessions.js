// clean-sessions.js
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionsPath = path.join(__dirname, 'sessions');

console.log('Limpiando directorio de sesiones...');

if (fs.existsSync(sessionsPath)) {
  const folders = fs.readdirSync(sessionsPath);
  
  folders.forEach(folder => {
    const folderPath = path.join(sessionsPath, folder);
    
    // Mantener solo 'demo' y carpetas que parezcan válidas
    if (folder !== 'demo' && folder.trim() !== '') {
      console.log(`Eliminando: ${folder}`);
      fs.removeSync(folderPath);
    } else if (folder.trim() === '') {
      console.log('Eliminando carpeta con nombre vacío');
      fs.removeSync(folderPath);
    } else {
      console.log(`Manteniendo: ${folder}`);
    }
  });
  
  console.log('Limpieza completada');
} else {
  console.log('No existe directorio de sesiones');
}