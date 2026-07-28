const fs = require('fs');
const sharp = require('./app/node_modules/sharp');
const path = require('path');

const ROOT = path.resolve(__dirname);
const BASE = `${ROOT}\\assets`;
const RESOURCES = `${ROOT}\\app\\resources`;
const ICONS = ['logo', 'logo-dark', 'logo-mark'];
const SIZES = [16, 32, 48, 64, 128, 256];

ICONS.forEach(name => {
  const src = `${BASE}/${name}.svg`;
  if (!fs.existsSync(src)) {
    console.log(`[skip] ${src} not found`);
    return;
  }
  SIZES.forEach(size => {
    const out = `${BASE}/${name}-${size}.png`;
    console.log(`[${name}] ${size}px`);
    sharp(src)
      .resize(size, size, { fit: 'contain', background: name === 'logo-dark' ? '#0a0a0f' : { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(out);
  });
});
console.log('Done — all PNGs generated.');
