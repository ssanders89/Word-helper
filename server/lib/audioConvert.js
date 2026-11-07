// Converts an arbitrary uploaded audio blob (e.g. webm/opus from the
// browser's MediaRecorder) into raw signed 16-bit little-endian PCM at a
// fixed sample rate, suitable for streaming to a Wyoming Whisper service.
const { spawn } = require('child_process');

const SAMPLE_RATE = 16000;

function toPcm16(inputBuffer) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-f', 's16le',
      '-ar', String(SAMPLE_RATE),
      '-ac', '1',
      'pipe:1',
    ]);

    const outChunks = [];
    const errChunks = [];

    ffmpeg.stdout.on('data', (d) => outChunks.push(d));
    ffmpeg.stderr.on('data', (d) => errChunks.push(d));
    ffmpeg.on('error', (err) => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(errChunks).toString('utf8')}`));
        return;
      }
      resolve(Buffer.concat(outChunks));
    });

    ffmpeg.stdin.on('error', () => {
      /* ignore EPIPE if ffmpeg exits early on bad input */
    });
    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}

module.exports = { toPcm16, SAMPLE_RATE };
