/**
 * zip-setup.js
 *
 * Runs after electron-builder produces the NSIS setup exe.
 * Finds the setup exe in dist/ and creates a zip archive of it
 * for web distribution.
 *
 * Usage: node scripts/zip-setup.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = path.join(__dirname, '..', 'dist');

// Read version from package.json to target the correct setup exe
const pkg = require(path.join(__dirname, '..', 'package.json'));
const setupExe = `petmate9-${pkg.version}-win-x64-setup.exe`;

if (!fs.existsSync(path.join(distDir, setupExe))) {
  console.error(`Setup exe not found in dist/: ${setupExe}`);
  process.exit(1);
}

const setupPath = path.join(distDir, setupExe);
const zipName = setupExe.replace('.exe', '.zip');
const zipPath = path.join(distDir, zipName);

// Remove existing zip if present
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// Use PowerShell's Compress-Archive to create the zip
console.log(`Compressing ${setupExe} -> ${zipName}`);
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${setupPath}' -DestinationPath '${zipPath}'"`,
  { stdio: 'inherit' }
);

console.log(`Created ${zipPath}`);
