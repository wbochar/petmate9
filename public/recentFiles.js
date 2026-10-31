
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_RECENT_FILES = 10;
const RECENT_FILES_NAME = 'recent-files.json';

function getRecentFilesPath() {
  return path.join(app.getPath('userData'), RECENT_FILES_NAME);
}

function readRecentFilesFromDisk() {
  try {
    const filePath = getRecentFilesPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to read recent files:', e.message);
  }
  return [];
}

function writeRecentFilesToDisk(files) {
  try {
    const filePath = getRecentFilesPath();
    fs.writeFileSync(filePath, JSON.stringify(files, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write recent files:', e.message);
  }
}

/**
 * Returns true when `filePath` exists on disk and is a regular file (not a
 * directory or other special file type).
 * @param {string} filePath
 * @returns {boolean}
 */
function isValidRecentFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Get the list of recent files, filtering out any that no longer exist on
 * disk or are no longer regular files.
 * @returns {string[]} Array of absolute file paths
 */
function getRecentFiles() {
  const files = readRecentFilesFromDisk();
  const existing = files.filter(isValidRecentFile);
  // If we filtered any out, persist the cleaned list
  if (existing.length !== files.length) {
    writeRecentFilesToDisk(existing);
  }
  return existing;
}

/**
 * Add a file to the top of the recent files list.
 * Deduplicates, caps at MAX_RECENT_FILES, and persists to disk.
 * Also calls app.addRecentDocument() for OS-level integration.
 * @param {string} filePath - Absolute path to the file
 * @returns {string[]} Updated list of recent files
 */
function addRecentFile(filePath) {
  if (!filePath) return getRecentFiles();

  const normalized = path.resolve(filePath);
  // Don't add paths that don't exist (or aren't regular files) to the
  // recent-files list or native OS recent-documents menu -- otherwise a
  // stale/invalid entry can linger in the OS-level list (macOS dock menu /
  // Windows JumpList), which isn't re-validated by getRecentFiles().
  if (!isValidRecentFile(normalized)) {
    return getRecentFiles();
  }
  let files = readRecentFilesFromDisk();

  // Remove if already present (we'll re-add at top)
  files = files.filter(f => path.resolve(f) !== normalized);

  // Add to top
  files.unshift(normalized);

  // Cap the list
  if (files.length > MAX_RECENT_FILES) {
    files = files.slice(0, MAX_RECENT_FILES);
  }

  writeRecentFilesToDisk(files);

  // OS-level integration (macOS dock menu, Windows JumpList)
  try {
    app.addRecentDocument(normalized);
  } catch (e) {
    // Silently ignore if not supported on this platform
  }

  return files;
}

/**
 * Clear all recent files and persist.
 */
function clearRecentFiles() {
  writeRecentFilesToDisk([]);
  try {
    app.clearRecentDocuments();
  } catch (e) {
    // Silently ignore
  }
  return [];
}

module.exports = {
  getRecentFiles,
  addRecentFile,
  clearRecentFiles
};
