// Optional AI-generated encouragement messages. The game is fully playable
// without any of this configured -- it just falls back to a canned list of
// kid-friendly phrases. AI_PROVIDER selects "anthropic", "local" (any
// OpenAI-compatible chat completions endpoint, e.g. Ollama), or "none".

const CANNED_CORRECT = [
  'Great job! You got it!',
  "Yes! That's right!",
  'Awesome guessing!',
  'Super smart! Well done!',
  "You've got it! Nice work!",
];

const CANNED_INCORRECT = [
  'Good try! Let’s look again.',
  "Nice guess! Let's try another one.",
  "Almost! Keep going, you're doing great.",
  "That's okay! Practice makes perfect.",
];

function pickCanned(correct) {
  const list = correct ? CANNED_CORRECT : CANNED_INCORRECT;
  return list[Math.floor(Math.random() * list.length)];
}

function buildPrompt({ correct, word, letter, guessedLetter }) {
  return (
    'You are a cheerful assistant for a preschool letter-learning game. ' +
    'Write exactly one short, upbeat sentence (max 12 words) speaking directly ' +
    `to a young child. The word was "${word}" which starts with the letter ${letter}. ` +
    (correct
      ? 'The child guessed correctly.'
      : `The child guessed the letter ${guessedLetter || '?'}, which was incorrect.`) +
    ' No emoji, no quotation marks, just the sentence.'
  );
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function anthropicFeedback(context) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
  const res = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 60,
        messages: [{ role: 'user', content: buildPrompt(context) }],
      }),
    },
    6000
  );
  if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
  const json = await res.json();
  const text = json.content && json.content[0] && json.content[0].text;
  if (!text) throw new Error('Anthropic API returned no text');
  return text.trim();
}

async function localFeedback(context) {
  const url = process.env.LOCAL_AI_URL;
  const model = process.env.LOCAL_AI_MODEL || 'llama3.1';
  const apiKey = process.env.LOCAL_AI_API_KEY;
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 60,
        messages: [{ role: 'user', content: buildPrompt(context) }],
      }),
    },
    6000
  );
  if (!res.ok) throw new Error(`Local AI endpoint returned ${res.status}`);
  const json = await res.json();
  const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!text) throw new Error('Local AI endpoint returned no text');
  return text.trim();
}

function isConfigured() {
  const provider = process.env.AI_PROVIDER || 'none';
  if (provider === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === 'local') return Boolean(process.env.LOCAL_AI_URL);
  return false;
}

async function getFeedback(context) {
  const provider = process.env.AI_PROVIDER || 'none';
  try {
    if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      return await anthropicFeedback(context);
    }
    if (provider === 'local' && process.env.LOCAL_AI_URL) {
      return await localFeedback(context);
    }
  } catch (err) {
    console.error('AI feedback request failed, using a canned message instead:', err.message);
  }
  return pickCanned(context.correct);
}

module.exports = { getFeedback, isConfigured };
