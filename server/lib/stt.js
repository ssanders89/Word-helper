// Speech-to-text via a Wyoming-protocol Whisper service.
const { withConnection, writeEvent } = require('./wyoming');

const CHUNK_SIZE = 4096;

function isConfigured() {
  return Boolean(process.env.WHISPER_HOST);
}

// pcm: Buffer of signed 16-bit little-endian PCM audio.
async function transcribe(pcm, { rate = 16000, width = 2, channels = 1 } = {}) {
  const host = process.env.WHISPER_HOST;
  const port = Number(process.env.WHISPER_PORT || 10300);
  if (!host) throw new Error('Whisper is not configured (WHISPER_HOST is unset)');

  return withConnection({ host, port, timeoutMs: 20000 }, async (socket, reader) => {
    writeEvent(socket, { type: 'audio-start', data: { rate, width, channels } });
    for (let i = 0; i < pcm.length; i += CHUNK_SIZE) {
      writeEvent(socket, {
        type: 'audio-chunk',
        data: { rate, width, channels },
        payload: pcm.subarray(i, i + CHUNK_SIZE),
      });
    }
    writeEvent(socket, { type: 'audio-stop', data: {} });

    let event;
    while ((event = await reader.next()) !== null) {
      if (event.type === 'transcript') {
        return (event.data && event.data.text) || '';
      }
    }
    throw new Error('Whisper closed the connection before sending a transcript');
  });
}

module.exports = { transcribe, isConfigured };
