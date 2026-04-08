const { execSync } = require('child_process');
const path = require('path');

// On macOS 15+, com.apple.provenance is set on extracted files and cannot be
// removed by xattr. electron-builder's per-binary codesign calls fail because
// codesign treats provenance as "detritus". Workaround: sign the entire .app
// with codesign --deep in afterPack (before electron-builder attempts signing).
// Set CSC_IDENTITY_AUTO_DISCOVERY=false or mac.identity=null to skip
// electron-builder's own signing step.
exports.default = async function (context) {
  if (process.platform !== 'darwin') return;
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);

  // Find the Developer ID identity from keychain
  let identity;
  try {
    const ids = execSync('security find-identity -v -p codesigning').toString();
    const match = ids.match(/"(Developer ID Application:[^"]+)"/);
    if (match) identity = match[1];
  } catch (e) {}

  if (!identity) {
    console.log('  \u2022 no Developer ID identity found, skipping signing');
    return;
  }

  console.log(`  \u2022 signing with --deep: ${identity}`);
  execSync(
    `codesign --sign "${identity}" --force --timestamp --options runtime --deep "${appPath}"`,
    { stdio: 'inherit' }
  );
  console.log('  \u2022 signature applied successfully');
};
