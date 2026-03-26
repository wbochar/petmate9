
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const THEME_PREFS_NAME = 'theme-prefs.json';
const DEFAULT_THEME = 'dark';

function getThemePrefsPath() {
  return path.join(app.getPath('userData'), THEME_PREFS_NAME);
}

/**
 * Read the saved theme source from disk.
 * @returns {'dark' | 'light' | 'system'}
 */
function getThemeSource() {
  try {
    const filePath = getThemePrefsPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.themeSource === 'dark' || parsed.themeSource === 'light' || parsed.themeSource === 'system') {
        return parsed.themeSource;
      }
    }
  } catch (e) {
    console.error('Failed to read theme prefs:', e.message);
  }
  return DEFAULT_THEME;
}

/**
 * Save the theme source to disk.
 * @param {'dark' | 'light' | 'system'} themeSource
 */
function setThemeSource(themeSource) {
  try {
    const filePath = getThemePrefsPath();
    fs.writeFileSync(filePath, JSON.stringify({ themeSource }, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write theme prefs:', e.message);
  }
}

module.exports = {
  getThemeSource,
  setThemeSource
};
