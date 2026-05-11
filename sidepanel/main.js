// sidepanel/main.js — Learning loop controller

// ── Module-level editor instances ──
let editor = null;
let sandboxWindow = null;

// ── State ──
const state = {
  transcript: null,
  videoTitle: null,
  tabId: null,
  summary: null,
  quiz: [],
  challenge: null,
  quizIndex: 0,
  quizPassed: 0,
  hintIndex: 0,
  selectedOption: null,
};

function transcriptToPlainText(segments) {
  if (!Array.isArray(segments)) return segments ?? '';
  return segments.map(s => s.text).join(' ');
}

function renderExplanation(text, containerEl) {
  const parts = (text ?? '').split(/(\[t=\d+s\])/g);
  parts.forEach(part => {
    const match = part.match(/\[t=(\d+)s\]/);
    if (match) {
      const t = parseInt(match[1], 10);
      const m = Math.floor(t / 60);
      const s = (t % 60).toString().padStart(2, '0');
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'timestamp-link';
      a.dataset.t = String(t);
      a.textContent = `▶ ${m}:${s}`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: 'SEEK_VIDEO', payload: { t, tabId: state.tabId } });
      });
      containerEl.appendChild(a);
    } else if (part) {
      containerEl.appendChild(document.createTextNode(part));
    }
  });
}

// ── Screen management ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('btn-reset').classList.toggle('hidden', id === 'screen-idle' || id === 'screen-loading');
}

function setLoadingMsg(msg) {
  document.getElementById('loading-msg').textContent = msg;
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  showScreen('screen-error');
}

function resetQuiz() {
  for (let i = state.quiz.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.quiz[i], state.quiz[j]] = [state.quiz[j], state.quiz[i]];
  }
  state.quizIndex = 0;
  state.quizPassed = 0;
  state.selectedOption = null;
  document.getElementById('quiz-question-wrap').classList.remove('hidden');
  document.getElementById('quiz-complete').classList.add('hidden');
  document.getElementById('quiz-progress').style.width = '0%';
}

function resetState() {
  state.transcript = null;
  state.videoTitle = null;
  state.tabId = null;
  state.summary = null;
  state.quiz = [];
  state.challenge = null;
  state.quizIndex = 0;
  state.quizPassed = 0;
  state.hintIndex = 0;
  state.selectedOption = null;
  chrome.storage.session.remove(['savedSession', 'pendingSession']);
}

function persistState(currentScreen) {
  const { videoTitle, transcript, tabId, summary, quiz, challenge, quizIndex, quizPassed } = state;
  chrome.storage.session.set({
    savedSession: { videoTitle, transcript, tabId, summary, quiz, challenge, quizIndex, quizPassed, currentScreen }
  }).catch(e => console.error('[LearnLoop] persistState failed:', e));
}

async function restoreOrInit() {
  try {
    const { savedSession, pendingSession } = await chrome.storage.session.get(['savedSession', 'pendingSession']);

    if (pendingSession) {
      chrome.storage.session.remove(['pendingSession', 'savedSession']);
      state.videoTitle = pendingSession.title;
      state.transcript = pendingSession.transcript;
      state.tabId = pendingSession.tabId;
      startSession();
      return;
    }

    if (savedSession) {
      Object.assign(state, savedSession);
      if (savedSession.currentScreen === 'challenge') {
        renderChallenge();
        showScreen('screen-challenge');
      } else if (savedSession.currentScreen === 'quiz') {
        if (state.quizIndex >= state.quiz.length) {
          document.getElementById('quiz-question-wrap').classList.add('hidden');
          document.getElementById('quiz-complete').classList.remove('hidden');
        } else {
          renderQuizQuestion();
        }
        showScreen('screen-quiz');
      } else {
        renderSummary();
        showScreen('screen-summary');
      }
      return;
    }

    showScreen('screen-idle');
  } catch (e) {
    console.error('[LearnLoop] restoreOrInit failed:', e);
    showScreen('screen-idle');
  }
}


// ── Start session: call AI to generate all content ──
async function startSession() {
  showScreen('screen-loading');
  setLoadingMsg('Reading the transcript...');

  const response = await chrome.runtime.sendMessage({
    type: 'GENERATE_SESSION',
    payload: { transcript: state.transcript, videoTitle: state.videoTitle },
  });

  if (!response.ok) {
    showError(`Failed to generate session: ${response.error ?? 'unknown error'}`);
    return;
  }

  const { summary, quiz, challenge } = response.data;
  state.summary = summary;
  state.quiz = quiz;
  state.challenge = challenge;
  state.quizIndex = 0;
  state.quizPassed = 0;
  state.hintIndex = 0;

  persistState('summary');
  renderSummary();
  showScreen('screen-summary');
}

// ──────────────────────────────────────────────
// STEP 1: Summary
// ──────────────────────────────────────────────

function renderSummary() {
  const { summary } = state;
  document.getElementById('summary-title').textContent = summary.title;
  document.getElementById('summary-text').textContent = summary.summary;

  const list = document.getElementById('summary-points');
  list.innerHTML = '';
  summary.keyPoints.forEach(point => {
    const li = document.createElement('li');
    li.textContent = point;
    list.appendChild(li);
  });
}

document.getElementById('btn-start-quiz').addEventListener('click', () => {
  renderQuizQuestion();
  showScreen('screen-quiz');
});

// ──────────────────────────────────────────────
// STEP 2: Quiz
// ──────────────────────────────────────────────

function renderQuizQuestion() {
  const q = state.quiz[state.quizIndex];
  if (!q) return;

  // Reset UI
  document.getElementById('quiz-question-wrap').classList.remove('hidden');
  document.getElementById('quiz-complete').classList.add('hidden');
  state.selectedOption = null;
  document.getElementById('quiz-feedback').classList.add('hidden');
  document.getElementById('btn-quiz-next').classList.add('hidden');
  document.getElementById('btn-quiz-submit').classList.remove('hidden');
  document.getElementById('quiz-options').innerHTML = '';
  document.getElementById('quiz-freetext').classList.add('hidden');
  document.getElementById('quiz-freetext').value = '';
  document.getElementById('quiz-code-snippet').classList.add('hidden');

  // Progress bar
  const pct = (state.quizIndex / state.quiz.length) * 100;
  document.getElementById('quiz-progress').style.width = `${pct}%`;

  document.getElementById('quiz-question').textContent = q.question;

  if (q.codeSnippet) {
    const pre = document.getElementById('quiz-code-snippet');
    pre.textContent = q.codeSnippet;
    pre.classList.remove('hidden');
  }

  if (q.type === 'multiple-choice') {
    renderOptions(q);
  } else if (q.type === 'predict-output') {
    const ft = document.getElementById('quiz-freetext');
    ft.placeholder = 'Type the exact output…';
    ft.classList.remove('hidden');
  } else if (q.type === 'free-text') {
    const ft = document.getElementById('quiz-freetext');
    ft.placeholder = 'Type your answer...';
    ft.classList.remove('hidden');
  }
}

function renderOptions(q) {
  const container = document.getElementById('quiz-options');
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedOption = i;
    });
    container.appendChild(btn);
  });
}

document.getElementById('btn-quiz-submit').addEventListener('click', async () => {
  const q = state.quiz[state.quizIndex];
  const btn = document.getElementById('btn-quiz-submit');
  btn.disabled = true;

  if (q.type === 'free-text') {
    const answer = document.getElementById('quiz-freetext').value.trim();
    if (!answer) { btn.disabled = false; return; }

    showScreen('screen-loading');
    setLoadingMsg('Evaluating your answer...');

    const res = await chrome.runtime.sendMessage({
      type: 'EVALUATE_ANSWER',
      payload: {
        question: q.question,
        userAnswer: answer,
        transcript: transcriptToPlainText(state.transcript),
      },
    });

    if (res.ok) {
      showScreen('screen-quiz');
      showFeedback(res.data.passed, res.data.feedback);
      if (res.data.passed) state.quizPassed++;
    } else {
      showError(`Could not evaluate answer: ${res.error ?? 'unknown error'}`);
      return;
    }
  } else if (q.type === 'predict-output') {
    const answer = document.getElementById('quiz-freetext').value.trim();
    if (!answer) { btn.disabled = false; return; }
    if (!q.options || q.correctOption == null) {
      showFeedback(false, q.explanation ?? 'No answer key available.');
      btn.disabled = false;
      return;
    }
    const correct = String(q.options[q.correctOption]).trim().replace(/\s+/g, ' ');
    const normalised = answer.replace(/\s+/g, ' ');
    const passed = normalised === correct;
    if (passed) state.quizPassed++;
    showFeedback(passed, q.explanation);
  } else {
    if (state.selectedOption === null) { btn.disabled = false; return; }

    const passed = state.selectedOption === q.correctOption;
    if (passed) state.quizPassed++;

    // Colour the options
    document.querySelectorAll('.option-btn').forEach((optBtn, i) => {
      if (i === q.correctOption) optBtn.classList.add('correct');
      else if (i === state.selectedOption && !passed) optBtn.classList.add('wrong');
      optBtn.disabled = true;
    });

    showFeedback(passed, q.explanation);
  }

  btn.disabled = false;
});

function showFeedback(passed, feedback) {
  const el = document.getElementById('quiz-feedback');
  el.classList.remove('hidden', 'pass', 'fail');
  el.classList.add(passed ? 'pass' : 'fail');
  el.replaceChildren();
  el.appendChild(document.createTextNode(passed ? '✓ ' : '✗ '));
  renderExplanation(feedback, el);
  document.getElementById('btn-quiz-submit').classList.add('hidden');
  document.getElementById('btn-quiz-next').classList.remove('hidden');
}

document.getElementById('btn-retry').addEventListener('click', () => {
  if (!state.transcript) {
    showScreen('screen-idle');
    return;
  }
  startSession();
});

document.getElementById('btn-error-reset').addEventListener('click', () => {
  resetState();
  showScreen('screen-idle');
});

document.getElementById('btn-reset').addEventListener('click', () => {
  resetState();
  showScreen('screen-idle');
});

document.getElementById('btn-back-quiz').addEventListener('click', () => {
  state.quizIndex = 0;
  state.quizPassed = 0;
  state.selectedOption = null;
  persistState('summary');
  showScreen('screen-summary');
});

document.getElementById('btn-back-challenge').addEventListener('click', () => {
  document.getElementById('quiz-question-wrap').classList.add('hidden');
  document.getElementById('quiz-complete').classList.remove('hidden');
  persistState('quiz');
  showScreen('screen-quiz');
});

document.getElementById('btn-retry-quiz').addEventListener('click', () => {
  resetQuiz();
  renderQuizQuestion();
  showScreen('screen-quiz');
});

document.getElementById('btn-fail-to-summary').addEventListener('click', () => {
  resetQuiz();
  showScreen('screen-summary');
});

document.getElementById('btn-quiz-next').addEventListener('click', () => {
  state.quizIndex++;

  if (state.quizIndex >= state.quiz.length) {
    document.getElementById('quiz-progress').style.width = '100%';
    const threshold = Math.ceil(state.quiz.length * (2 / 3));
    if (state.quizPassed >= threshold) {
      persistState('quiz');
      document.getElementById('quiz-question-wrap').classList.add('hidden');
      document.getElementById('quiz-complete').classList.remove('hidden');
    } else {
      document.getElementById('fail-score').textContent =
        `You got ${state.quizPassed} of ${state.quiz.length} — need ${threshold} to continue.`;
      showScreen('screen-quiz-fail');
    }
  } else {
    persistState('quiz');
    renderQuizQuestion();
  }
});

document.getElementById('btn-start-challenge').addEventListener('click', () => {
  persistState('challenge');
  renderChallenge();
  showScreen('screen-challenge');
});

// ──────────────────────────────────────────────
// STEP 3: Challenge + IDE
// ──────────────────────────────────────────────

function renderChallenge() {
  const { challenge } = state;
  document.getElementById('challenge-title').textContent = challenge.title;
  document.getElementById('challenge-description').textContent = challenge.description;
  document.getElementById('test-results').innerHTML = '';
  document.getElementById('ide-output').textContent = '';
  document.getElementById('hint-display').classList.add('hidden');
  state.hintIndex = 0;

  // Initialize CodeMirror once; the instance is reused across challenges.
  const wrap = document.getElementById('ide-editor-wrap');
  if (!editor) {
    editor = CodeMirror(wrap, {
      mode: 'javascript',
      lineNumbers: true,
      matchBrackets: true,
      indentWithTabs: false,
      tabSize: 2,
      extraKeys: {
        'Ctrl-Enter': runCode,
        'Cmd-Enter': runCode,
      },
    });
  }
  editor.setValue(challenge.starterCode || '');
}

// ── Run code ──
document.getElementById('btn-run').addEventListener('click', () => {
  runCode();
});

function runCode() {
  if (!editor) return;
  document.getElementById('ide-output').textContent = '';
  document.getElementById('test-results').replaceChildren();

  const userCode = editor.getValue();
  if (!sandboxWindow) {
    sandboxWindow = document.getElementById('sandbox').contentWindow;
  }
  sandboxWindow.postMessage({
    type: 'RUN_CODE',
    code: userCode,
    tests: state.challenge.tests,
  }, '*');
}

// Listen for results from sandbox
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'RUN_RESULT') return;
  if (!sandboxWindow) sandboxWindow = document.getElementById('sandbox').contentWindow;
  if (event.source !== sandboxWindow) return;

  const { logs, testResults } = event.data;

  // Show console output
  const output = document.getElementById('ide-output');
  output.textContent = logs.join('\n') || '(no output)';

  // Show test cases
  const resultsEl = document.getElementById('test-results');
  resultsEl.innerHTML = '';
  testResults.forEach(t => {
    const div = document.createElement('div');
    div.className = `test-case ${t.pass ? 'pass' : 'fail'}`;
    div.innerHTML = `
      <span class="icon">${t.pass ? '✓' : '✗'}</span>
      <span class="desc">${t.description}${!t.pass ? ` — got <code>${t.actual}</code>, expected <code>${t.expected}</code>` : ''}</span>
    `;
    resultsEl.appendChild(div);
  });
});

// ── Hints ──
document.getElementById('btn-hint').addEventListener('click', () => {
  const { challenge } = state;
  const hintEl = document.getElementById('hint-display');

  if (state.hintIndex >= challenge.hints.length) {
    hintEl.textContent = 'No more hints!';
    hintEl.classList.remove('hidden');
    return;
  }

  hintEl.textContent = `💡 Hint ${state.hintIndex + 1}: ${challenge.hints[state.hintIndex]}`;
  hintEl.classList.remove('hidden');
  state.hintIndex++;
});

// ── Solution ──
document.getElementById('btn-solution').addEventListener('click', () => {
  const { challenge } = state;
  if (confirm('Show the solution? Try the hints first!')) {
    if (editor) editor.setValue(challenge.solution || '');
  }
});

// ── Provider model lists ──
const PROVIDER_MODELS = {
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — Fast · Cheap (default)' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 — Balanced' },
    { id: 'claude-opus-4-7',           label: 'Claude Opus 4.7 — Most capable' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini — Fast · Cheap (default)' },
    { id: 'gpt-4o',      label: 'GPT-4o — Most capable' },
  ],
  openrouter: null,
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — Balanced (default)' },
    { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B — Fastest' },
    { id: 'gemma2-9b-it',            label: 'Gemma 2 9B' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — Fast · Free tier (default)' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro — Most capable' },
  ],
};

function updateModelField(provider, savedModel) {
  const container = document.getElementById('model-field-container');
  const models = PROVIDER_MODELS[provider];

  while (container.firstChild) container.removeChild(container.firstChild);

  const label = document.createElement('label');
  label.setAttribute('for', 'setting-model');

  if (models == null) {
    label.textContent = 'Model ';
    const hint = document.createElement('span');
    hint.className = 'settings-optional';
    hint.textContent = '(optional)';
    label.appendChild(hint);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'setting-model';
    input.className = 'settings-input';
    input.placeholder = 'e.g. meta-llama/llama-3.3-70b-instruct:free';
    if (savedModel) input.value = savedModel;

    container.appendChild(label);
    container.appendChild(input);
  } else {
    label.textContent = 'Model';

    const select = document.createElement('select');
    select.id = 'setting-model';
    select.className = 'settings-select';

    models.forEach(m => {
      const option = document.createElement('option');
      option.value = m.id;
      option.textContent = m.label;
      if (savedModel === m.id) option.selected = true;
      select.appendChild(option);
    });

    container.appendChild(label);
    container.appendChild(select);
  }
}

// ── Settings ──

function showWelcome() {
  document.getElementById('idle-welcome').classList.remove('hidden');
  document.getElementById('idle-settings').classList.add('hidden');
}

function showSettingsPanel() {
  document.getElementById('idle-settings').classList.remove('hidden');
  document.getElementById('idle-welcome').classList.add('hidden');
}

chrome.storage.local.get('llmConfig').then(({ llmConfig }) => {
  const provider = llmConfig?.provider || 'anthropic';
  document.getElementById('setting-provider').value = provider;
  document.getElementById('setting-apikey').value = llmConfig?.apiKey || '';
  updateModelField(provider, llmConfig?.model || '');

  if (llmConfig?.apiKey) {
    showWelcome();
    document.getElementById('btn-back-settings').classList.remove('hidden');
  } else {
    showSettingsPanel();
  }
});

document.getElementById('setting-provider').addEventListener('change', (e) => {
  updateModelField(e.target.value, '');
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const provider = document.getElementById('setting-provider').value;
  const apiKey = document.getElementById('setting-apikey').value.trim();
  const model = document.getElementById('setting-model').value.trim();
  const status = document.getElementById('settings-status');

  if (!apiKey) {
    status.style.color = 'var(--error)';
    status.textContent = 'API key is required.';
    return;
  }

  const existing = await chrome.storage.local.get('llmConfig');
  const currentCfg = existing.llmConfig || {};
  await chrome.storage.local.set({
    llmConfig: { ...currentCfg, provider, apiKey, model: model || undefined },
  });

  status.style.color = 'var(--success)';
  status.textContent = 'Saved!';
  document.getElementById('btn-back-settings').classList.remove('hidden');
  setTimeout(() => {
    status.textContent = '';
    showWelcome();
  }, 800);
});

document.getElementById('btn-open-settings').addEventListener('click', () => {
  showSettingsPanel();
});

document.getElementById('btn-back-settings').addEventListener('click', () => {
  showWelcome();
});

document.getElementById('more-settings-link').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ── Init ──
restoreOrInit();
