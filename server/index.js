require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');

const library = require('./lib/library');
const rounds = require('./lib/rounds');
const stt = require('./lib/stt');
const tts = require('./lib/tts');
const ai = require('./lib/ai');
const audioConvert = require('./lib/audioConvert');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB is plenty for a few seconds of audio
});

const MAX_LETTER_OPTIONS = 6;
const MIN_LETTER_OPTIONS = 2;

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildLetterOptions(correctLetter, allLetters) {
  const distractors = shuffle(allLetters.filter((l) => l !== correctLetter));
  const count = Math.min(MAX_LETTER_OPTIONS, allLetters.length);
  const wanted = Math.max(MIN_LETTER_OPTIONS - 1, count - 1);
  const chosen = distractors.slice(0, wanted);
  return shuffle([correctLetter, ...chosen]);
}

// ---------------------------------------------------------------------------
// GET /api/config -- tells the frontend what's available so it can hide
// modes/inputs that aren't usable.
// ---------------------------------------------------------------------------
app.get('/api/config', async (req, res, next) => {
  try {
    const letters = await library.scanLibrary();
    const totalImages = letters.reduce((sum, l) => sum + l.files.length, 0);
    res.json({
      picturesDir: library.picturesDir(),
      letterCount: letters.length,
      imageCount: totalImages,
      letters: letters.map((l) => l.letter),
      sttEnabled: stt.isConfigured(),
      ttsEnabled: tts.isConfigured(),
      aiEnabled: ai.isConfigured(),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/round { mode: 'audio'|'picture', inputMethod: 'spoken'|'select' }
// Picks a random picture and creates a round. Never reveals the answer.
// ---------------------------------------------------------------------------
app.post('/api/round', async (req, res, next) => {
  try {
    const mode = req.body.mode === 'audio' ? 'audio' : 'picture';
    const inputMethod = req.body.inputMethod === 'spoken' ? 'spoken' : 'select';

    if (mode === 'audio' && !tts.isConfigured()) {
      return res.status(409).json({ error: 'Piper (text-to-speech) is not configured, so "hear the word" mode is unavailable.' });
    }
    if (inputMethod === 'spoken' && !stt.isConfigured()) {
      return res.status(409).json({ error: 'Whisper (speech-to-text) is not configured, so spoken answers are unavailable.' });
    }

    const picture = await library.pickRandomPicture();
    if (!picture) {
      return res.status(404).json({ error: 'No pictures found. Add letter folders (A, B, C, ...) with images under the pictures directory.' });
    }

    const id = rounds.createRound({
      letter: picture.letter,
      word: picture.word,
      filePath: picture.filePath,
      filename: picture.filename,
      mode,
      inputMethod,
    });

    const response = { roundId: id, mode, inputMethod };
    if (inputMethod === 'select') {
      response.options = buildLetterOptions(picture.letter, picture.allLetters);
    }
    if (mode === 'picture') {
      response.imageUrl = `/api/round/${id}/media`;
    } else {
      response.audioUrl = `/api/round/${id}/audio`;
    }
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/round/:id/media -- streams the round's picture (picture mode).
// ---------------------------------------------------------------------------
app.get('/api/round/:id/media', (req, res) => {
  const round = rounds.getRound(req.params.id);
  if (!round) return res.status(404).end();
  res.setHeader('Content-Type', library.mimeTypeFor(round.filename));
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(round.filePath).on('error', () => res.status(404).end()).pipe(res);
});

// ---------------------------------------------------------------------------
// GET /api/round/:id/audio -- synthesizes and streams the spoken word
// (audio mode), via Piper.
// ---------------------------------------------------------------------------
app.get('/api/round/:id/audio', async (req, res, next) => {
  try {
    const round = rounds.getRound(req.params.id);
    if (!round) return res.status(404).end();
    const wav = await tts.synthesize(round.word);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(wav);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/round/:id/hint -- optional spoken hint of the word, usable in
// either mode (e.g. a "hear it again" button), via Piper.
// ---------------------------------------------------------------------------
app.get('/api/round/:id/hint', async (req, res, next) => {
  try {
    const round = rounds.getRound(req.params.id);
    if (!round) return res.status(404).end();
    if (!tts.isConfigured()) return res.status(409).json({ error: 'Piper is not configured.' });
    const wav = await tts.synthesize(round.word);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(wav);
  } catch (err) {
    next(err);
  }
});

// Note: rounds are intentionally *not* deleted right after answering --
// the client still needs the round's media URL to reveal the picture. The
// background TTL sweep in lib/rounds.js cleans them up a few minutes later.

// ---------------------------------------------------------------------------
// POST /api/round/:id/answer { letter } -- for the "select from letters" input.
// ---------------------------------------------------------------------------
app.post('/api/round/:id/answer', async (req, res, next) => {
  try {
    const round = rounds.getRound(req.params.id);
    if (!round) return res.status(404).json({ error: 'This round has expired. Start a new one.' });
    const letter = String(req.body.letter || '').trim().toUpperCase();
    if (!letter) return res.status(400).json({ error: 'Missing letter.' });

    const correct = letter === round.letter;
    const feedbackMessage = await ai.getFeedback({ correct, word: round.word, letter: round.letter, guessedLetter: letter });
    res.json({
      correct,
      correctLetter: round.letter,
      word: round.word,
      guessedLetter: letter,
      imageUrl: `/api/round/${req.params.id}/media`,
      feedbackMessage,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/round/:id/answer-spoken -- for the "say the letter" input.
// Accepts an uploaded audio blob, transcribes it via Whisper, and scores it.
// ---------------------------------------------------------------------------
app.post('/api/round/:id/answer-spoken', upload.single('audio'), async (req, res, next) => {
  try {
    const round = rounds.getRound(req.params.id);
    if (!round) return res.status(404).json({ error: 'This round has expired. Start a new one.' });
    if (!req.file) return res.status(400).json({ error: 'No audio uploaded.' });
    if (!stt.isConfigured()) return res.status(409).json({ error: 'Whisper is not configured.' });

    const pcm = await audioConvert.toPcm16(req.file.buffer);
    const transcript = await stt.transcribe(pcm, { rate: audioConvert.SAMPLE_RATE });
    const match = transcript.match(/[A-Za-z]/);
    const guessedLetter = match ? match[0].toUpperCase() : '';

    if (!guessedLetter) {
      return res.json({
        correct: false,
        correctLetter: null,
        transcript,
        guessedLetter: null,
        feedbackMessage: "I couldn't hear a letter -- want to try again?",
        noMatch: true,
      });
    }

    const correct = guessedLetter === round.letter;
    const feedbackMessage = await ai.getFeedback({ correct, word: round.word, letter: round.letter, guessedLetter });
    res.json({
      correct,
      correctLetter: round.letter,
      word: round.word,
      transcript,
      guessedLetter,
      imageUrl: `/api/round/${req.params.id}/media`,
      feedbackMessage,
    });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(port, () => {
  console.log(`Word Helper listening on port ${port}`);
  console.log(`Pictures directory: ${library.picturesDir()}`);
});
