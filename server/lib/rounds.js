// In-memory store for active game rounds. Each round hides the correct
// answer behind an opaque id so the client never receives the answer
// letter or a URL that gives it away before the child guesses.
const crypto = require('crypto');

const ROUND_TTL_MS = 10 * 60 * 1000; // 10 minutes
const rounds = new Map();

function createRound(data) {
  const id = crypto.randomBytes(16).toString('hex');
  rounds.set(id, { ...data, createdAt: Date.now() });
  return id;
}

function getRound(id) {
  const round = rounds.get(id);
  if (!round) return null;
  if (Date.now() - round.createdAt > ROUND_TTL_MS) {
    rounds.delete(id);
    return null;
  }
  return round;
}

function deleteRound(id) {
  rounds.delete(id);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, round] of rounds) {
    if (now - round.createdAt > ROUND_TTL_MS) rounds.delete(id);
  }
}, 60 * 1000).unref();

module.exports = { createRound, getRound, deleteRound };
