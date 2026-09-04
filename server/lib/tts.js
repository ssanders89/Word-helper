// Text-to-speech via a Wyoming-protocol Piper service.
const { withConnection, writeEvent } = require('./wyoming');
const { pcmToWav } = require('./wav');

function isConfigured() {
  return Boolean(process.env.PIPER_HOST);
}

// Returns a Buffer containing a WAV file.
async function synthesize(text) {
  const host = process.env.PIPER_HOST;
  const port = Number(process.env.PIPER_PORT || 10200);
  const voice = process.env.PIPER_VOICE || '';
  if (!host) throw new Error('Piper is not configured (PIPER_HOST is unset)');

  return withConnection({ host, port, timeoutMs: 20000 }, async (socket, reader) => {
    const data = { text };
    if (voice) data.voice = { name: voice };
    writeEvent(socket, { type: 'synthesize', data });

    let rate = 22050;
    let width = 2;
    let channels = 1;
    const chunks = [];

    let event;
    while ((event = await reader.next()) !== null) {
      if (event.type === 'audio-start') {
        rate = event.data.rate || rate;
        width = event.data.width || width;
        channels = event.data.channels || channels;
      } else if (event.type === 'audio-chunk') {
        if (event.payload) chunks.push(event.payload);
      } else if (event.type === 'audio-stop') {
        break;
      } else if (event.type === 'error') {
        throw new Error((event.data && event.data.text) || 'Piper reported an error');
      }
    }

    if (!chunks.length) throw new Error('Piper returned no audio');
    const pcm = Buffer.concat(chunks);
    return pcmToWav(pcm, { rate, width, channels });
  });
}

module.exports = { synthesize, isConfigured };
