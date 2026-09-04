// Minimal client for the Wyoming protocol used by Home Assistant's
// Whisper (STT) and Piper (TTS) voice services.
//
// Wire format: newline-delimited JSON "header" lines, each optionally
// followed by a raw binary payload whose length is given by the header's
// `payload_length` field.
//   {"type": "...", "data": {...}, "payload_length": 1234}\n<1234 raw bytes>

const net = require('net');

// Buffers incoming bytes off a socket and yields parsed Wyoming events
// one at a time via next().
function createEventReader(socket) {
  let buf = Buffer.alloc(0);
  const pending = [];
  const resolvers = [];
  let closed = false;
  let closeErr = null;

  function drain() {
    for (;;) {
      const nl = buf.indexOf(0x0a); // '\n'
      if (nl === -1) break;
      const headerLine = buf.subarray(0, nl).toString('utf8');
      let header;
      try {
        header = JSON.parse(headerLine);
      } catch (err) {
        buf = buf.subarray(nl + 1);
        continue;
      }
      const payloadLength = header.payload_length || 0;
      if (buf.length < nl + 1 + payloadLength) break; // wait for more data
      const payload = payloadLength > 0 ? buf.subarray(nl + 1, nl + 1 + payloadLength) : null;
      buf = buf.subarray(nl + 1 + payloadLength);
      pending.push({ type: header.type, data: header.data || {}, payload });
    }
    while (pending.length && resolvers.length) {
      resolvers.shift().resolve(pending.shift());
    }
    if (closed) {
      while (resolvers.length) {
        const r = resolvers.shift();
        if (closeErr) r.reject(closeErr);
        else r.resolve(null);
      }
    }
  }

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    drain();
  });
  socket.on('close', () => {
    closed = true;
    drain();
  });
  socket.on('error', (err) => {
    closed = true;
    closeErr = err;
    drain();
  });

  return {
    next() {
      if (pending.length) return Promise.resolve(pending.shift());
      if (closed) return closeErr ? Promise.reject(closeErr) : Promise.resolve(null);
      return new Promise((resolve, reject) => resolvers.push({ resolve, reject }));
    },
  };
}

function writeEvent(socket, { type, data = {}, payload = null }) {
  const header = { type, data };
  if (payload && payload.length) header.payload_length = payload.length;
  socket.write(JSON.stringify(header) + '\n');
  if (payload && payload.length) socket.write(payload);
}

// Opens a TCP connection, runs `handler(socket, reader)` once connected,
// and guarantees the socket is closed and a timeout is enforced either way.
function withConnection({ host, port, timeoutMs = 15000 }, handler) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`Timed out connecting to ${host}:${port}`));
    }, timeoutMs);

    function finish(fn, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.end();
      } catch (_) {
        /* ignore */
      }
      fn(value);
    }

    socket.on('error', (err) => finish(reject, err));

    socket.on('connect', async () => {
      try {
        const reader = createEventReader(socket);
        const result = await handler(socket, reader);
        finish(resolve, result);
      } catch (err) {
        finish(reject, err);
      }
    });
  });
}

module.exports = { createEventReader, writeEvent, withConnection };
