// Scans the top-level pictures directory for per-letter subfolders and the
// images inside them. The app trusts this structure completely: a folder
// named "A" is assumed to contain pictures that start with "A", and a
// picture's "word" is simply derived from its filename. Nothing here
// verifies that the contents actually match -- that's up to whoever
// manages the folder.
const fs = require('fs/promises');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);
const LETTER_FOLDER_RE = /^[A-Za-z]$/;

function picturesDir() {
  return process.env.PICTURES_DIR || '/pictures';
}

function filenameToWord(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const spaced = base.replace(/[_-]+/g, ' ').trim();
  return spaced || base;
}

// Returns [{ letter, files: [filename, ...] }] for every letter folder that
// contains at least one recognizable image file.
async function scanLibrary() {
  const root = picturesDir();
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const letters = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!LETTER_FOLDER_RE.test(entry.name)) continue;

    const letterDir = path.join(root, entry.name);
    let files;
    try {
      files = await fs.readdir(letterDir, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    const images = files
      .filter((f) => f.isFile() && IMAGE_EXTENSIONS.has(path.extname(f.name).toLowerCase()))
      .map((f) => f.name)
      .sort();

    if (images.length > 0) {
      letters.push({ letter: entry.name.toUpperCase(), files: images });
    }
  }

  letters.sort((a, b) => a.letter.localeCompare(b.letter));
  return letters;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Picks a random letter (with at least one image) and a random image from it.
async function pickRandomPicture() {
  const letters = await scanLibrary();
  if (letters.length === 0) return null;
  const entry = pickRandom(letters);
  const filename = pickRandom(entry.files);
  return {
    letter: entry.letter,
    filename,
    word: filenameToWord(filename),
    filePath: path.join(picturesDir(), entry.letter, filename),
    allLetters: letters.map((l) => l.letter),
  };
}

function mimeTypeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    case '.avif':
      return 'image/avif';
    default:
      return 'application/octet-stream';
  }
}

module.exports = { scanLibrary, pickRandomPicture, filenameToWord, mimeTypeFor, picturesDir };
