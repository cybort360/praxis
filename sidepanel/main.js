// sidepanel/main.js — Learning loop controller

// ── State ──
const state = {
  transcript: null,
  videoTitle: null,
  summary: null,
  quiz: [],
  challenge: null,
  quizIndex: 0,
  quizPassed: 0,
  hintIndex: 0,
  selectedOption: null,
};

// ── Screen management ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setLoadingMsg(msg) {
  document.getElementById('loading-msg').textContent = msg;
}

// ── Pull pending session from storage on load ──
// background.js writes to storage.session before opening the panel, so we pull
// here instead of waiting for a push message that would arrive before this
// listener is attached.
chrome.storage.session.get('pendingSession').then(({ pendingSession }) => {
  if (!pendingSession) return;
  chrome.storage.session.remove('pendingSession');
  state.videoTitle = pendingSession.title;
  state.transcript = pendingSession.transcript;
  startSession();
});

// ── Start session: call AI to generate all content ──
async function startSession() {
  showScreen('screen-loading');
  setLoadingMsg('Reading the transcript...');

  const response = await chrome.runtime.sendMessage({
    type: 'GENERATE_SESSION',
    payload: { transcript: state.transcript, videoTitle: state.videoTitle },
  });

  if (!response.ok) {
    alert(`Error generating session: ${response.error}`);
    showScreen('screen-idle');
    return;
  }

  const { summary, quiz, challenge } = response.data;
  state.summary = summary;
  state.quiz = quiz;
  state.challenge = challenge;
  state.quizIndex = 0;
  state.quizPassed = 0;
  state.hintIndex = 0;

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

  if (q.type === 'multiple-choice' || q.type === 'predict-output') {
    renderOptions(q);
  } else if (q.type === 'free-text') {
    document.getElementById('quiz-freetext').classList.remove('hidden');
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
      payload: { question: q.question, userAnswer: answer, transcript: state.transcript },
    });

    showScreen('screen-quiz');

    if (res.ok) {
      showFeedback(res.data.passed, res.data.feedback, q.explanation);
      if (res.data.passed) state.quizPassed++;
    }
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

    showFeedback(passed, q.explanation, q.explanation);
  }

  btn.disabled = false;
});

function showFeedback(passed, feedback, explanation) {
  const el = document.getElementById('quiz-feedback');
  el.classList.remove('hidden', 'pass', 'fail');
  el.classList.add(passed ? 'pass' : 'fail');
  el.textContent = passed ? `✓ ${feedback}` : `✗ ${feedback}`;

  document.getElementById('btn-quiz-submit').classList.add('hidden');
  document.getElementById('btn-quiz-next').classList.remove('hidden');
}

document.getElementById('btn-quiz-next').addEventListener('click', () => {
  state.quizIndex++;

  if (state.quizIndex >= state.quiz.length) {
    // Quiz complete
    document.getElementById('quiz-progress').style.width = '100%';
    document.getElementById('quiz-question-wrap').classList.add('hidden');
    document.getElementById('quiz-complete').classList.remove('hidden');
  } else {
    renderQuizQuestion();
  }
});

document.getElementById('btn-start-challenge').addEventListener('click', () => {
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
  document.getElementById('ide-editor').value = challenge.starterCode;
  document.getElementById('test-results').innerHTML = '';
  document.getElementById('ide-output').textContent = '';
  document.getElementById('hint-display').classList.add('hidden');
  state.hintIndex = 0;
}

// ── Run code ──
document.getElementById('btn-run').addEventListener('click', () => {
  const code = document.getElementById('ide-editor').value;
  runCode(code);
});

function runCode(userCode) {
  const output = document.getElementById('ide-output');
  const sandbox = document.getElementById('sandbox');
  const results = document.getElementById('test-results');

  output.textContent = '';
  results.innerHTML = '';

  const { challenge } = state;

  // Build the sandboxed code:
  // 1. Capture console.log output
  // 2. Run user's code
  // 3. Run each test case
  // 4. Post results back via postMessage

  const tests = JSON.stringify(challenge.tests);

  const sandboxCode = `
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => {
      logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    };

    let testResults = [];

    try {
      ${userCode}

      const tests = ${tests};
      tests.forEach(test => {
        try {
          const actual = eval(test.input);
          const expected = eval(test.expectedOutput);
          const pass = JSON.stringify(actual) === JSON.stringify(expected);
          testResults.push({ description: test.description, pass, actual: JSON.stringify(actual), expected: JSON.stringify(expected) });
        } catch (e) {
          testResults.push({ description: test.description, pass: false, actual: 'Error: ' + e.message, expected: test.expectedOutput });
        }
      });
    } catch (e) {
      logs.push('Error: ' + e.message);
    }

    window.parent.postMessage({ type: 'RUN_RESULT', logs, testResults }, '*');
  `;

  // Write to sandbox iframe
  const blob = new Blob([`<script>${sandboxCode}<\/script>`], { type: 'text/html' });
  sandbox.src = URL.createObjectURL(blob);
}

// Listen for results from sandbox
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'RUN_RESULT') return;

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
    document.getElementById('ide-editor').value = challenge.solution;
  }
});

// ── Init: check if already idle ──
showScreen('screen-idle');
