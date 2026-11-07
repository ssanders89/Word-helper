(() => {
  'use strict';

  const state = {
    config: null,
    mode: null, // 'picture' | 'audio'
    inputMethod: null, // 'select' | 'spoken'
    round: null,
    score: { correct: 0, total: 0 },
    mediaRecorder: null,
    recordedChunks: [],
  };

  const el = (id) => document.getElementById(id);

  const setupScreen = el('setupScreen');
  const gameScreen = el('gameScreen');
  const statusBanner = el('statusBanner');
  const startButton = el('startButton');
  const modeChoices = el('modeChoices');
  const inputChoices = el('inputChoices');

  const promptImage = el('promptImage');
  const audioPrompt = el('audioPrompt');
  const replayAudioBtn = el('replayAudio');
  const hintButton = el('hintButton');
  const selectAnswer = el('selectAnswer');
  const spokenAnswer = el('spokenAnswer');
  const recordButton = el('recordButton');
  const recordLabel = el('recordLabel');
  const transcriptLine = el('transcriptLine');
  const feedback = el('feedback');
  const feedbackMessage = el('feedbackMessage');
  const revealArea = el('revealArea');
  const nextButton = el('nextButton');
  const quitButton = el('quitButton');
  const scoreBox = el('score');
  const scoreValue = el('scoreValue');

  function showBanner(text) {
    statusBanner.textContent = text;
    statusBanner.hidden = false;
  }

  async function loadConfig() {
    const res = await fetch('/api/config');
    const config = await res.json();
    state.config = config;

    if (config.letterCount === 0) {
      showBanner(
        `No pictures found yet. Add letter folders (A, B, C, ...) with images under ${config.picturesDir}, then reload this page.`
      );
    } else if (!config.ttsEnabled && !config.sttEnabled) {
      showBanner('Voice features (Whisper/Piper) are not configured -- you can still play with pictures and tapping letters.');
    }

    const audioCard = modeChoices.querySelector('[data-mode="audio"]');
    if (!config.ttsEnabled) {
      audioCard.disabled = true;
      audioCard.title = 'Piper (text-to-speech) is not configured';
    }

    const spokenCard = inputChoices.querySelector('[data-input="spoken"]');
    if (!config.sttEnabled) {
      spokenCard.disabled = true;
      spokenCard.title = 'Whisper (speech-to-text) is not configured';
    }

    if (config.letterCount === 0) {
      startButton.disabled = true;
    }
  }

  function wireChoiceRow(row, attr, onPick) {
    row.querySelectorAll('.choice-card').forEach((card) => {
      card.addEventListener('click', () => {
        if (card.disabled) return;
        row.querySelectorAll('.choice-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        onPick(card.dataset[attr]);
      });
    });
  }

  wireChoiceRow(modeChoices, 'mode', (value) => {
    state.mode = value;
    updateStartButton();
  });

  wireChoiceRow(inputChoices, 'input', (value) => {
    state.inputMethod = value;
    updateStartButton();
  });

  function updateStartButton() {
    const ready = state.mode && state.inputMethod && state.config && state.config.letterCount > 0;
    startButton.disabled = !ready;
  }

  startButton.addEventListener('click', () => {
    state.score = { correct: 0, total: 0 };
    updateScoreDisplay();
    scoreBox.hidden = false;
    setupScreen.hidden = true;
    gameScreen.hidden = false;
    startRound();
  });

  quitButton.addEventListener('click', () => {
    gameScreen.hidden = true;
    setupScreen.hidden = false;
    scoreBox.hidden = true;
  });

  nextButton.addEventListener('click', startRound);

  function updateScoreDisplay() {
    scoreValue.textContent = `${state.score.correct} / ${state.score.total}`;
  }

  function resetAnswerUI() {
    promptImage.hidden = true;
    audioPrompt.hidden = true;
    hintButton.hidden = true;
    selectAnswer.hidden = true;
    selectAnswer.innerHTML = '';
    spokenAnswer.hidden = true;
    transcriptLine.textContent = '';
    recordButton.classList.remove('recording');
    recordButton.disabled = false;
    recordLabel.textContent = 'Tap to speak';
    feedback.hidden = true;
    revealArea.innerHTML = '';
  }

  async function startRound() {
    resetAnswerUI();
    try {
      const res = await fetch('/api/round', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: state.mode, inputMethod: state.inputMethod }),
      });
      const round = await res.json();
      if (!res.ok) {
        showRoundError(round.error || 'Could not start a new round.');
        return;
      }
      state.round = round;
      renderRound(round);
    } catch (err) {
      showRoundError('Could not reach the server. Please try again.');
    }
  }

  function showRoundError(message) {
    feedback.hidden = false;
    feedbackMessage.textContent = message;
    nextButton.textContent = 'Try again';
  }

  function renderRound(round) {
    nextButton.textContent = 'Next word ➜';

    if (round.mode === 'picture') {
      promptImage.src = round.imageUrl;
      promptImage.hidden = false;
      if (state.config.ttsEnabled) hintButton.hidden = false;
    } else {
      audioPrompt.hidden = false;
      playAudio(round.audioUrl);
    }

    if (round.inputMethod === 'select') {
      renderSelectAnswer(round.options);
    } else {
      spokenAnswer.hidden = false;
    }
  }

  function playAudio(url) {
    const audio = new Audio(url);
    audio.play().catch(() => {
      /* autoplay may be blocked; the replay/hint buttons still work */
    });
  }

  replayAudioBtn.addEventListener('click', () => {
    if (state.round && state.round.audioUrl) playAudio(state.round.audioUrl);
  });

  hintButton.addEventListener('click', () => {
    if (state.round) playAudio(`/api/round/${state.round.roundId}/hint`);
  });

  function renderSelectAnswer(options) {
    selectAnswer.hidden = false;
    selectAnswer.innerHTML = '';
    options.forEach((letter) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'letter-button';
      btn.textContent = letter;
      btn.addEventListener('click', () => submitLetterAnswer(letter, btn));
      selectAnswer.appendChild(btn);
    });
  }

  async function submitLetterAnswer(letter, buttonEl) {
    const buttons = Array.from(selectAnswer.querySelectorAll('.letter-button'));
    buttons.forEach((b) => (b.disabled = true));

    try {
      const res = await fetch(`/api/round/${state.round.roundId}/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ letter }),
      });
      const result = await res.json();
      if (!res.ok) {
        showRoundError(result.error || 'Something went wrong.');
        return;
      }

      buttonEl.classList.add(result.correct ? 'correct' : 'incorrect');
      if (!result.correct) {
        const correctBtn = buttons.find((b) => b.textContent === result.correctLetter);
        if (correctBtn) correctBtn.classList.add('correct');
      }

      recordScore(result.correct);
      showFeedback(result);
    } catch (err) {
      showRoundError('Could not reach the server. Please try again.');
    }
  }

  recordButton.addEventListener('click', () => {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      state.mediaRecorder.stop();
    } else {
      startRecording();
    }
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      state.recordedChunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) state.recordedChunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(state.recordedChunks, { type: recorder.mimeType || 'audio/webm' });
        submitSpokenAnswer(blob);
      };
      state.mediaRecorder = recorder;
      recorder.start();
      recordButton.classList.add('recording');
      recordLabel.textContent = 'Tap to stop';
      transcriptLine.textContent = 'Listening...';
    } catch (err) {
      transcriptLine.textContent = "Couldn't access the microphone. Check your browser permissions.";
    }
  }

  async function submitSpokenAnswer(blob) {
    recordButton.classList.remove('recording');
    recordButton.disabled = true;
    recordLabel.textContent = 'Thinking...';
    transcriptLine.textContent = '';

    const formData = new FormData();
    formData.append('audio', blob, 'answer.webm');

    try {
      const res = await fetch(`/api/round/${state.round.roundId}/answer-spoken`, {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) {
        showRoundError(result.error || 'Something went wrong.');
        return;
      }

      if (result.transcript) {
        transcriptLine.textContent = `I heard: "${result.transcript.trim()}"`;
      }

      if (result.noMatch) {
        recordLabel.textContent = 'Tap to speak';
        recordButton.disabled = false;
        return;
      }

      recordScore(result.correct);
      showFeedback(result);
    } catch (err) {
      showRoundError('Could not reach the server. Please try again.');
    }
  }

  function recordScore(correct) {
    state.score.total += 1;
    if (correct) state.score.correct += 1;
    updateScoreDisplay();
  }

  function showFeedback(result) {
    feedback.hidden = false;
    feedbackMessage.textContent = result.feedbackMessage || (result.correct ? 'Correct!' : 'Not quite!');
    feedbackMessage.style.color = result.correct ? 'var(--good)' : 'var(--bad)';

    revealArea.innerHTML = '';
    if (result.imageUrl) {
      const img = document.createElement('img');
      img.src = result.imageUrl;
      img.alt = result.word || '';
      revealArea.appendChild(img);
    }
    const textWrap = document.createElement('div');
    const letterEl = document.createElement('div');
    letterEl.className = 'reveal-letter';
    letterEl.textContent = result.correctLetter || '';
    const wordEl = document.createElement('div');
    wordEl.className = 'reveal-word';
    wordEl.textContent = result.word || '';
    textWrap.appendChild(letterEl);
    textWrap.appendChild(wordEl);
    revealArea.appendChild(textWrap);
  }

  loadConfig();
})();
