// sidepanel/main.js — Learning loop controller

// ── Theme toggle ──
(function initTheme() {
  const saved = localStorage.getItem('ll-theme') || 'dark';
  applyTheme(saved);
})();

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ll-theme', theme);
  const useEl = document.querySelector('#theme-icon use');
  if (useEl) useEl.setAttribute('href', theme === 'light' ? '#ic-moon' : '#ic-sun');
}

document.getElementById('btn-theme').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ── Module-level editor instances ──
let editor = null;
let sandboxWindow = null;
let previousScreen = 'screen-idle';

// ── State ──
const state = {
  transcript: null,
  videoTitle: null,
  videoUrl:   null,
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
      a.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:9px;height:9px;vertical-align:middle;margin-right:2px"><path d="M8 5v14l11-7z"/></svg>${m}:${s}`;
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
  const hideReset = id === 'screen-idle' || id === 'screen-loading' || id === 'screen-history';
  document.getElementById('btn-reset').classList.toggle('hidden', hideReset);
  if (id === 'screen-complete') _restartConfetti();
}

function _restartConfetti() {
  document.querySelectorAll('.complete-fireworks i').forEach(el => {
    el.style.animation = 'none';
    // Force reflow so the browser registers the reset before re-applying
    void el.offsetWidth;
    el.style.animation = '';
  });
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
  state.videoUrl   = null;
  state.tabId = null;
  state.summary = null;
  state.quiz = [];
  state.challenge = null;
  state.quizIndex = 0;
  state.quizPassed = 0;
  state.hintIndex = 0;
  state.selectedOption = null;
  Chat.reset();
  chrome.storage.session.remove(['savedSession', 'pendingSession']);
}

function persistState(currentScreen) {
  const { videoTitle, transcript, tabId, summary, quiz, challenge, quizIndex, quizPassed } = state;
  chrome.storage.session.set({
    savedSession: { videoTitle, transcript, tabId, summary, quiz, challenge, quizIndex, quizPassed, currentScreen }
  }).catch(e => console.error('[Praxis] persistState failed:', e));
}

async function restoreOrInit() {
  try {
    const { savedSession, pendingSession } = await chrome.storage.session.get(['savedSession', 'pendingSession']);

    if (pendingSession) {
      chrome.storage.session.remove(['pendingSession', 'savedSession']);
      state.videoTitle = pendingSession.title;
      state.videoUrl   = pendingSession.videoId;
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
    console.error('[Praxis] restoreOrInit failed:', e);
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

  History.saveSession({ videoTitle: state.videoTitle, url: state.videoUrl, summary });

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
  document.getElementById('summary-text').textContent  = summary.summary;

  const list = document.getElementById('summary-points');
  list.innerHTML = '';
  summary.keyPoints.forEach(point => {
    const li = document.createElement('li');
    li.textContent = point;
    list.appendChild(li);
  });

  // Reset to Summary tab on every render
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="summary"]').classList.add('active');
  document.querySelector('.tab-panel[data-tab="summary"]').classList.add('active');

  renderTranscript();
  Chat.init(state.transcript, state.videoTitle);
}

document.getElementById('btn-copy-summary').addEventListener('click', async () => {
  const { summary } = state;
  if (!summary) return;
  const md = [
    `# ${summary.title}`,
    '',
    summary.summary,
    '',
    '## Key Points',
    ...summary.keyPoints.map(p => `- ${p}`),
  ].join('\n');
  try {
    await navigator.clipboard.writeText(md);
    const btn = document.getElementById('btn-copy-summary');
    const original = btn.innerHTML;
    btn.textContent = '✓ Copied!';
    btn.disabled = true;
    setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 2000);
  } catch (e) {
    console.error('[Praxis] Copy failed:', e);
  }
});

document.getElementById('btn-start-quiz').addEventListener('click', () => {
  renderQuizQuestion();
  showScreen('screen-quiz');
});

function renderTranscript() {
  const list = document.getElementById('transcript-list');
  list.innerHTML = '';
  const segs = state.transcript;

  if (!Array.isArray(segs) || segs.length === 0) {
    list.innerHTML =
      '<p style="color:var(--text-muted);font-size:13px;padding:24px 0;text-align:center">Transcript not available for this session.</p>';
    return;
  }

  segs.forEach(seg => {
    const t   = Math.floor(seg.t);
    const m   = Math.floor(t / 60);
    const s   = String(t % 60).padStart(2, '0');
    const btn = document.createElement('button');
    btn.className = 'transcript-row';

    const tsSpan = document.createElement('span');
    tsSpan.className = 'transcript-ts';
    tsSpan.textContent = `${m}:${s}`;

    const textSpan = document.createElement('span');
    textSpan.className = 'transcript-text';
    textSpan.textContent = seg.text;

    btn.appendChild(tsSpan);
    btn.appendChild(textSpan);

    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SEEK_VIDEO', payload: { t, tabId: state.tabId } });
      btn.classList.add('highlight');
      setTimeout(() => btn.classList.remove('highlight'), 700);
    });
    list.appendChild(btn);
  });
}

function initSummaryTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.tab-panel[data-tab="${tab}"]`).classList.add('active');
    });
  });
}

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
  const iconEl = document.createElement('span');
  iconEl.className = 'feedback-icon';
  iconEl.innerHTML = passed
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><path d="M20 6 9 17l-5-5"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  el.appendChild(iconEl);
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

// CodeMirror mode names for languages we bundle a mode file for.
// Any language not listed here falls back to plain text (null mode).
const CM_MODES = {
  javascript:  'javascript',
  typescript:  'javascript',
  rust:        'rust',
  python:      'python',
  c:           'text/x-csrc',
  cpp:         'text/x-c++src',
  'c++':       'text/x-c++src',
  java:        'text/x-java',
  csharp:      'text/x-csharp',
  'c#':        'text/x-csharp',
  go:          'go',
  shell:       'shell',
  bash:        'shell',
};

// Human-readable labels for the IDE language badge.
const LANG_DISPLAY = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python:     'Python',
  rust:       'Rust',
  go:         'Go',
  java:       'Java',
  c:          'C',
  cpp:        'C++',
  'c++':      'C++',
  csharp:     'C#',
  'c#':       'C#',
  shell:      'Shell',
  bash:       'Bash',
};

function renderChallenge() {
  const { challenge } = state;
  document.getElementById('challenge-title').textContent = challenge.title;
  document.getElementById('challenge-description').textContent = challenge.description;
  document.getElementById('test-results').innerHTML = '';
  document.getElementById('ide-output').textContent = '';
  document.getElementById('hint-display').classList.add('hidden');
  state.hintIndex = 0;

  const lang = (challenge.language || 'javascript').toLowerCase();
  const mode = CM_MODES[lang] || null;

  // Update the IDE language badge to reflect actual language
  const displayName = LANG_DISPLAY[lang]
    || lang.charAt(0).toUpperCase() + lang.slice(1);
  document.getElementById('ide-lang-name').textContent = displayName;

  // Initialize CodeMirror once; update mode + content on each challenge.
  const wrap = document.getElementById('ide-editor-wrap');
  if (!editor) {
    editor = CodeMirror(wrap, {
      mode,
      lineNumbers: true,
      matchBrackets: true,
      indentWithTabs: false,
      tabSize: 2,
      extraKeys: { 'Ctrl-Enter': runCode, 'Cmd-Enter': runCode },
    });
  } else {
    editor.setOption('mode', mode);
  }
  editor.setValue(challenge.starterCode || '');
}

// ── Parse PASS/FAIL stdout protocol ───────────────────────────────────────
// Any language's test harness should print either:
//   PASS: <description>
//   FAIL: <description> | got: <actual> | expected: <expected>
function parseTestOutput(stdout) {
  return stdout.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('PASS:') || l.startsWith('FAIL:'))
    .map(l => {
      if (l.startsWith('PASS:')) return { description: l.slice(5).trim(), pass: true, actual: '', expected: '' };
      const body   = l.slice(5).trim();
      const parts  = body.split(' | ');
      const description = parts[0].trim();
      const actual      = (parts.find(p => p.startsWith('got:'))      || '').replace(/^got:\s*/, '');
      const expected    = (parts.find(p => p.startsWith('expected:')) || '').replace(/^expected:\s*/, '');
      return { description, pass: false, actual, expected };
    });
}

// ── Render test results (shared by both sandbox and Piston paths) ─────────
function displayTestResults(results) {
  const el = document.getElementById('test-results');
  el.innerHTML = '';
  results.forEach(t => {
    const div = document.createElement('div');
    div.className = `test-case ${t.pass ? 'pass' : 'fail'}`;
    div.innerHTML = `
      <span class="test-case-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px" stroke-width="${t.pass ? '2.5' : '2'}">
          ${t.pass ? '<path d="M20 6 9 17l-5-5"/>' : '<path d="M18 6 6 18M6 6l12 12"/>'}
        </svg>
      </span>
      <span class="test-case-body">
        <span class="test-case-desc">${t.description}</span>
        ${!t.pass ? `<span class="test-case-detail">got ${t.actual} &nbsp;·&nbsp; expected ${t.expected}</span>` : ''}
      </span>`;
    el.appendChild(div);
  });
}

// ── Run code ──────────────────────────────────────────────────────────────
document.getElementById('btn-run').addEventListener('click', () => runCode());

function runCode() {
  if (!editor) return;
  document.getElementById('ide-output').textContent = '';
  document.getElementById('test-results').replaceChildren();

  const userCode  = editor.getValue();
  const challenge = state.challenge;
  const lang      = (challenge.language || 'javascript').toLowerCase();

  if (lang === 'javascript') {
    // ── JavaScript: run in local sandbox (fast, works offline) ──
    if (!sandboxWindow) sandboxWindow = document.getElementById('sandbox').contentWindow;

    if (challenge.testRunner) {
      // New format: testRunner appended to user code; PASS/FAIL lines in logs
      sandboxWindow.postMessage(
        { type: 'RUN_CODE', code: userCode + '\n' + challenge.testRunner, tests: [] }, '*');
    } else {
      // Legacy format: tests array with input/expectedOutput
      sandboxWindow.postMessage(
        { type: 'RUN_CODE', code: userCode, tests: challenge.tests || [] }, '*');
    }
  } else {
    // ── Other languages: execute via Piston API ──
    if (!challenge.testRunner) {
      document.getElementById('ide-output').textContent = 'No test runner — regenerate the challenge.';
      return;
    }

    const btn = document.getElementById('btn-run');
    btn.disabled  = true;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:12px;height:12px;display:inline-block;vertical-align:middle">
      <circle cx="12" cy="12" r="9" stroke-opacity="0.25"/>
      <path d="M12 3a9 9 0 0 1 9 9">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.75s" repeatCount="indefinite"/>
      </path></svg> Running…`;

    chrome.runtime.sendMessage(
      { type: 'EXECUTE_CODE', payload: { language: lang, code: userCode + '\n' + challenge.testRunner } },
      (resp) => {
        btn.disabled  = false;
        btn.innerHTML = `<svg class="icon icon-xs" aria-hidden="true"><use href="#ic-play"/></svg> Run`;

        const outputEl = document.getElementById('ide-output');
        if (!resp?.ok) {
          outputEl.textContent = 'Error: ' + (resp?.error || 'Unknown error');
          return;
        }

        // Stderr = compiler/runtime errors; show separately from test output
        const nonTestLines = resp.stdout.split('\n')
          .filter(l => !l.trim().match(/^(PASS|FAIL):/))
          .join('\n').trim();
        outputEl.textContent = resp.stderr
          ? resp.stderr.trim() + (nonTestLines ? '\n' + nonTestLines : '')
          : (nonTestLines || '(no output)');

        const pistonResults = parseTestOutput(resp.stdout);
        displayTestResults(pistonResults);
        if (pistonResults.length > 0 && pistonResults.every(r => r.pass)) {
          setTimeout(() => showCompletionScreen(), 800);
        }
      }
    );
  }
}

// ── Sandbox result handler (JavaScript only) ──────────────────────────────
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'RUN_RESULT') return;
  if (!sandboxWindow) sandboxWindow = document.getElementById('sandbox').contentWindow;
  if (event.source !== sandboxWindow) return;

  const { logs, testResults: rawResults } = event.data;
  const outputEl = document.getElementById('ide-output');
  let results;

  if (rawResults?.length > 0) {
    outputEl.textContent = logs.join('\n') || '(no output)';
    results = rawResults;
    displayTestResults(results);
  } else {
    const allOutput = logs.join('\n');
    const nonTest   = logs.filter(l => !l.trim().match(/^(PASS|FAIL):/)).join('\n').trim();
    outputEl.textContent = nonTest || '(no output)';
    results = parseTestOutput(allOutput);
    displayTestResults(results);
  }

  if (results.length > 0 && results.every(r => r.pass)) {
    setTimeout(() => showCompletionScreen(), 800);
  }
});

// ── Completion screen ─────────────────────────────────────────────────────
async function showCompletionScreen() {
  const stats = await History.loadStats();

  // Subtitle: personalise based on streak
  const streak = stats.currentStreak;
  const subtitle = streak >= 3
    ? `${streak}-day streak 🔥 — you're on a roll!`
    : streak === 2
    ? `2 days in a row — keep it going!`
    : `You completed the full loop: watched, quizzed, and built.`;

  document.getElementById('complete-subtitle').textContent = subtitle;

  // Mini stats row
  const statsEl = document.getElementById('complete-stats');
  statsEl.innerHTML = '';
  const items = [
    { icon: 'ic-flame',        color: '#f97316', value: stats.currentStreak,                      label: 'Streak'   },
    { icon: 'ic-layers',       color: '#7c6af7', value: stats.totalSessions,                      label: 'Sessions' },
    { icon: 'ic-circle-check', color: '#34d399', value: `${state.quizPassed}/${state.quiz.length}`, label: 'Quiz'   },
  ];
  items.forEach(({ icon, color, value, label }) => {
    const item  = document.createElement('div');
    item.className = 'stat-item';

    const wrap = document.createElement('div');
    wrap.className = 'stat-icon-wrap';
    wrap.style.color = color;
    wrap.innerHTML = `<svg class="icon icon-sm" aria-hidden="true"><use href="#${icon}"/></svg>`;

    const num = document.createElement('div');
    num.className = 'stat-number';
    num.textContent = value;

    const lbl = document.createElement('div');
    lbl.className = 'stat-label';
    lbl.textContent = label;

    item.appendChild(wrap);
    item.appendChild(num);
    item.appendChild(lbl);
    statsEl.appendChild(item);
  });

  showScreen('screen-complete');
}

document.getElementById('btn-complete-restart').addEventListener('click', () => {
  resetState();
  showScreen('screen-idle');
});

document.getElementById('btn-complete-history').addEventListener('click', () => {
  previousScreen = 'screen-complete';
  History.renderStats();
  History.renderHistory();
  showScreen('screen-history');
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

  hintEl.innerHTML = '';
  const hintIconEl = document.createElement('span');
  hintIconEl.className = 'hint-icon';
  hintIconEl.innerHTML = `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/></svg>`;
  const hintTextEl = document.createElement('span');
  hintTextEl.textContent = `Hint ${state.hintIndex + 1}: ${challenge.hints[state.hintIndex]}`;
  hintEl.appendChild(hintIconEl);
  hintEl.appendChild(hintTextEl);
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

// ── History navigation ──
document.getElementById('btn-history').addEventListener('click', () => {
  previousScreen = document.querySelector('.screen.active')?.id || 'screen-idle';
  History.renderStats();
  History.renderHistory();
  showScreen('screen-history');
});

document.getElementById('btn-back-history').addEventListener('click', () => {
  showScreen(previousScreen);
});

document.getElementById('btn-clear-history').addEventListener('click', async () => {
  if (confirm('Clear all session history?')) {
    await History.clearHistory();
  }
});

// ── Init ──
initSummaryTabs();

// Enable history icon if past sessions already exist
History.loadHistory().then(list => {
  if (list.length > 0) {
    const btn = document.getElementById('btn-history');
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
  }
});

restoreOrInit();
