// Copia a interface (../www) e o ícone para dentro do pacote do Windows
const fs = require('fs'); const path = require('path');
const dst = path.join(__dirname, 'www');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(__dirname, '..', 'www'), dst, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'assets', 'icon.ico'), path.join(__dirname, 'icon.ico'));
console.log('Interface copiada para desktop/www');
