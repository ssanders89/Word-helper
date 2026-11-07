# Word Helper

A web app to help a preschooler learn her letters and words -- pick a game
mode, and either **see a picture** or **hear a word**, then guess what
letter it starts with by **tapping a letter** or **saying it out loud**.

- Speech (hearing the word, and understanding a spoken answer) is powered by
  your existing **Piper** (text-to-speech) and **Whisper** (speech-to-text)
  services, over the Wyoming protocol (the same protocol used by the
  Home Assistant Whisper/Piper add-ons).
- Optional short, AI-generated encouragement messages ("Great job!", etc.)
  can come from **Claude** or any local OpenAI-compatible model (e.g.
  Ollama) -- or just use the built-in canned phrases, no AI required.
- Runs as a single Docker container.

## How it works

You manage a `pictures/` folder with one subfolder per letter:

```
pictures/
  A/
    apple.jpg
    ant.png
  B/
    ball.jpg
    banana.jpg
```

The app trusts this structure completely: the **folder name is the answer
letter**, and the **word is derived from the filename** (`ice_cream.jpg` ->
"ice cream"). It never checks whether a picture actually matches its
folder -- that's entirely up to you. See [`pictures/README.md`](pictures/README.md)
for details.

### Game modes

Two independent choices, made on the start screen:

| Prompt                                    | Answer input                         |
| ------------------------------------------ | ------------------------------------- |
| 🖼️ See the picture, guess the letter       | 👉 Pick from a shuffled list of letters (the correct one is always included) |
| 🔊 Hear the word (via Piper), guess the letter | 🎤 Say the letter out loud (transcribed via Whisper) |

All four combinations are available as long as the relevant voice service
is configured (see below) -- the app hides options it can't support.

## Running with Docker

### Quick start (no voice/AI services)

```bash
docker build -t word-helper .
docker run -p 3000:3000 -v "$(pwd)/pictures:/pictures:ro" word-helper
```

Open http://localhost:3000. Without Whisper/Piper configured, the game
still works fully in picture + tap-a-letter mode.

### With your Whisper/Piper stack (docker-compose)

Edit [`docker-compose.yml`](docker-compose.yml): point `WHISPER_HOST` /
`PIPER_HOST` at your existing services (container/service name and Wyoming
port), and put `word-helper` on the same Docker network as them (the
`voice-stack` network in the example is a placeholder -- replace it with
whatever external network your Whisper/Piper containers already use).

```bash
docker compose up -d --build
```

## Configuration (environment variables)

See [`.env.example`](.env.example) for the full list with comments. The
essentials:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PICTURES_DIR` | Path to the letter-folders library | `/pictures` |
| `WHISPER_HOST` / `WHISPER_PORT` | Wyoming Whisper service for spoken answers | unset (disables spoken input) |
| `PIPER_HOST` / `PIPER_PORT` / `PIPER_VOICE` | Wyoming Piper service for "hear the word" mode & hints | unset (disables audio mode) |
| `AI_PROVIDER` | `anthropic`, `local`, or `none` | `none` |
| `ANTHROPIC_API_KEY` / `AI_MODEL` | Used when `AI_PROVIDER=anthropic` | -- |
| `LOCAL_AI_URL` / `LOCAL_AI_MODEL` / `LOCAL_AI_API_KEY` | Used when `AI_PROVIDER=local` (any OpenAI-compatible `/chat/completions` endpoint, e.g. Ollama) | -- |
| `PORT` | HTTP port the app listens on | `3000` |

The app degrades gracefully: with nothing configured beyond `PICTURES_DIR`,
you get the picture + tap-a-letter game with canned encouragement messages.

## Local development (without Docker)

Requires Node.js 20+ and `ffmpeg` on your PATH (needed only for the spoken
"say the letter" input, to convert recorded audio for Whisper).

```bash
npm install
cp .env.example .env   # edit as needed
npm run dev
```

## Notes on the Wyoming protocol integration

Whisper and Piper are talked to directly over their Wyoming TCP protocol
(newline-delimited JSON events, e.g. `audio-chunk` / `transcript` for STT,
`synthesize` / `audio-chunk` for TTS) -- there's no dependency on any HTTP
wrapper. If your setup exposes Whisper/Piper differently (e.g. a REST
proxy), you'll need to adjust `server/lib/stt.js` and `server/lib/tts.js`
accordingly.
