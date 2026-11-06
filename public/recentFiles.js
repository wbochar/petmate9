
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
 *
 * Async (uses fs.promises.stat, not fs.statSync) so a slow-to-respond path
 * -- e.g. a disconnected network share or an unmounted removable drive --
 * can't block the Electron main process's event loop. The main process
 * also drives window/menu interaction, so a blocking stat() call here
 * would freeze the whole app's UI, not just the recent-files feature,
 * for as long as the filesystem/network takes to time out.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function isValidRecentFile(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Get the list of recent files, filtered to only those that currently
 * exist on disk and are regular files.
 *
 * This intentionally does NOT persist the filtered-down list back to disk.
 * Doing so previously meant a path that's only *transiently* unavailable
 * (a disconnected network drive, a removable drive not currently mounted,
 * etc.) got permanently dropped from the recent-files list the first time
 * a single check happened to fail -- with no way back short of manually
 * re-opening the file. The full list, including currently-unreachable
 * entries, stays on disk; every call re-checks from scratch, so an entry
 * reappears on its own as soon as the path becomes reachable again.
 * Genuinely stale entries are still naturally bounded out over time by
 * addRecentFile()'s MAX_RECENT_FILES cap (or removed explicitly via
 * "Clear Recent"), so the list can't grow without bound.
 * @returns {Promise<string[]>} Array of absolute file paths
 */
async function getRecentFiles() {
  const files = readRecentFilesFromDisk();
  const checks = await Promise.all(files.map(isValidRecentFile));
  return files.filter((_file, i) => checks[i]);
}

/**
 * Add a file to the top of the recent files list.
 * Deduplicates, caps at MAX_RECENT_FILES, and persists to disk.
 * Also calls app.addRecentDocument() for OS-level integration.
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<string[]>} Updated list of recent files
 */
async function addRecentFile(filePath) {
  if (!filePath) return getRecentFiles();

  const normalized = path.resolve(filePath);
  // Don't add paths that don't exist (or aren't regular files) to the
  // recent-files list or native OS recent-documents menu -- otherwise a
  // stale/invalid entry can linger in the OS-level list (macOS dock menu /
  // Windows JumpList), which isn't re-validated by getRecentFiles().
  if (!(await isValidRecentFile(normalized))) {
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
