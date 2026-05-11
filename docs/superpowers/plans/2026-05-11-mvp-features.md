# LearnLoop MVP Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Features A, B, C, D, E, F and Bug #3 fix to make LearnLoop testable end-to-end.

**Architecture:** Feature-by-feature, minimal footprint — no structural refactoring. Content script gains a manual trigger + watch gate. Side panel gains an error screen, quiz fail screen, reset/back nav, and session persistence. All logic stays in existing files.

**Tech Stack:** Vanilla JS, Chrome Extension Manifest V3, `chrome.storage.session`, no build step.

**Testing note:** No automated test runner is configured for this Chrome extension. Each task includes manual verification steps — load the extension unpacked in `chrome://extensions`, then follow the listed steps.

---

## File Map

| File | What changes |
|------|-------------|
| `content/content.js` | Remove auto-trigger; add injected button, `timeupdate` watch gate, `triggerSession()`, `teardown()` |
| `sidepanel/index.html` | Add `#screen-error`, `#screen-quiz-fail`, `#btn-reset`, back buttons in quiz + challenge headers |
| `sidepanel/main.js` | `showError()`, `resetState()`, `resetQuiz()`, `persistState()`, `restoreOrInit()`, updated `showScreen()`, Ctrl+Enter listener, quiz pass gate |

`background.js`, `ai/`, `popup/`, `manifest.json` — untouched.

---

## Task 1: Feature A — Manual start trigger + 30% watch gate

**Files:**
- Modify: `content/content.js`

### What changes
- Remove the auto-trigger in `onNewVideo` (currently calls `fetchTranscript` directly).
- Add module-level variables: `startButton`, `videoTimeListener`, `isTriggering`.
- `onNewVideo` now calls `injectStartButton(videoId)` and `setupWatchGate(videoId)` after the 2s delay.
- `teardown()` removes the button and detaches the listener. Called on every video navigation and on trigger.
- `triggerSession(videoId)` guards with `isTriggering`, tears down, fetches transcript, sends message.

- [ ] **Replace `content/content.js` with the following:**

```js
// content/content.js — Injected into YouTube pages
(function () {
  'use strict';

  let lastVideoId = null;
  let sessionStarted = false;
  let startButton = null;
  let videoTimeListener = null;
  let isTriggering = false;

  const observer = new MutationObserver(() => {
    const videoId = getVideoId();
    if (videoId && videoId !== lastVideoId) {
      lastVideoId = videoId;
      sessionStarted = false;
      isTriggering = false;
      teardown();
      onNewVideo(videoId);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  const initialId = getVideoId();
  if (initialId) onNewVideo(initialId);

  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v') || null;
  }

  function getVideoTitle() {
    return (
      document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')?.textContent?.trim() ||
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() ||
      document.title.replace(' - YouTube', '').trim()
    );
  }

  function teardown() {
    if (startButton) {
      startButton.remove();
      startButton = null;
    }
    const video = document.querySelector('video');
    if (video && videoTimeListener) {
      video.removeEventListener('timeupdate', videoTimeListener);
      videoTimeListener = null;
    }
  }

  async function onNewVideo(videoId) {
    if (sessionStarted) return;
    await sleep(2000);
    injectStartButton(videoId);
    setupWatchGate(videoId);
  }

  function injectStartButton(videoId) {
    startButton = document.createElement('button');
    startButton.id = '__ll_start_btn';
    startButton.textContent = '▶ Start LearnLoop';
    Object.assign(startButton.style, {
      position: 'fixed',
      bottom: '80px',
      right: '20px',
      zIndex: '9999',
      background: '#7c3aed',
      color: '#fff',
      border: 'none',
      borderRadius: '9999px',
      padding: '10px 18px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    });
    startButton.addEventListener('click', () => triggerSession(videoId));
    document.body.appendChild(startButton);
  }

  function setupWatchGate(videoId) {
    const video = document.querySelector('video');
    if (!video) return;
    videoTimeListener = () => {
      if (video.duration && video.currentTime / video.duration >= 0.3) {
        triggerSession(videoId);
      }
    };
    video.addEventListener('timeupdate', videoTimeListener);
  }

  async function triggerSession(videoId) {
    if (isTriggering || sessionStarted) return;
    isTriggering = true;
    teardown();

    const title = getVideoTitle();
    let transcript = null;
    try {
      transcript = await fetchTranscript(videoId);
    } catch (e) {
      console.warn('[LearnLoop] Could not fetch transcript:', e.message);
      isTriggering = false;
      return;
    }

    sessionStarted = true;
    chrome.runtime.sendMessage({
      type: 'VIDEO_DETECTED',
      payload: { videoId, title, transcript },
    });
  }

  function getPlayerData() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timeout waiting for ytInitialPlayerResponse')),
        5000
      );
      window.addEventListener('message', (e) => {
        if (e.data?.type === '__LL_PLAYER_DATA') {
          clearTimeout(timer);
          resolve(e.data.data);
        }
      }, { once: true });
      const script = document.createElement('script');
      script.textContent = `
        window.postMessage({ type: '__LL_PLAYER_DATA', data: window.ytInitialPlayerResponse }, '*');
      `;
      document.documentElement.appendChild(script);
      script.remove();
    });
  }

  async function fetchTranscript(videoId) {
    const playerResponse = await getPlayerData();
    const captionTracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error('No caption tracks found');
    }
    const track =
      captionTracks.find(t => t.languageCode === 'en') ||
      captionTracks.find(t => t.languageCode?.startsWith('en')) ||
      captionTracks[0];
    const transcriptRes = await fetch(track.baseUrl);
    const xml = await transcriptRes.text();
    return parseTranscriptXML(xml);
  }

  function parseTranscriptXML(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const texts = doc.querySelectorAll('text');
    return Array.from(texts)
      .map(el => el.textContent.replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim())
      .filter(Boolean)
      .join(' ');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
```

- [ ] **Verify manually:**
  1. Go to `chrome://extensions`, reload the extension.
  2. Navigate to any YouTube video with captions (e.g. a coding tutorial).
  3. After ~2 seconds, a purple "▶ Start LearnLoop" pill button should appear in the bottom-right.
  4. Click it — button disappears, side panel opens, loading spinner shows.
  5. Reload the page and this time let the video play past 30% without clicking — the panel should open automatically.
  6. Navigate to a different video — old button disappears, a new one appears after 2s.

- [ ] **Commit:**
```bash
git add content/content.js
git commit -m "feat: add manual start button and 30% watch gate to content script"
```

---

## Task 2: HTML — Add all new screens and controls to index.html

**Files:**
- Modify: `sidepanel/index.html`

### What changes
Add in one pass:
- `#btn-reset` — fixed-position top-right reset button (hidden by default)
- `#screen-error` — error screen with Try Again + Start Over
- `#screen-quiz-fail` — quiz fail screen with score, Try Again, Back to Summary
- Back buttons inside the quiz and challenge screen headers

- [ ] **Replace `sidepanel/index.html` with the following:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LearnLoop</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>

  <!-- ── Global: Reset button (hidden on idle screen) ── -->
  <button id="btn-reset" class="btn btn-ghost btn-sm hidden" style="position:fixed;top:12px;right:12px;z-index:100;">↺ Reset</button>

  <!-- ── SCREEN: Idle (no video detected yet) ── -->
  <div id="screen-idle" class="screen active">
    <div class="idle-content">
      <div class="logo">⟳ LearnLoop</div>
      <p>Navigate to a YouTube tutorial to get started.</p>
    </div>
  </div>

  <!-- ── SCREEN: Loading (AI generating content) ── -->
  <div id="screen-loading" class="screen">
    <div class="loading-content">
      <div class="spinner"></div>
      <p id="loading-msg">Analysing transcript...</p>
    </div>
  </div>

  <!-- ── SCREEN: Error ── -->
  <div id="screen-error" class="screen">
    <div class="screen-header">
      <h2>Something went wrong</h2>
    </div>
    <p id="error-message" style="margin:16px 0;color:var(--color-text-muted,#aaa);"></p>
    <button id="btn-retry" class="btn btn-primary">Try Again</button>
    <button id="btn-error-reset" class="btn btn-secondary" style="margin-top:8px;">Start Over</button>
  </div>

  <!-- ── SCREEN: Summary ── -->
  <div id="screen-summary" class="screen">
    <div class="screen-header">
      <span class="step-badge">Step 1 of 3</span>
      <h2 id="summary-title"></h2>
    </div>
    <p id="summary-text"></p>
    <ul id="summary-points"></ul>
    <button id="btn-start-quiz" class="btn btn-primary">Take the Quiz →</button>
  </div>

  <!-- ── SCREEN: Quiz ── -->
  <div id="screen-quiz" class="screen">
    <div class="screen-header">
      <span class="step-badge">Step 2 of 3</span>
      <h2>Prove You Understood It</h2>
      <button id="btn-back-quiz" class="btn btn-ghost btn-sm">← Back</button>
      <div class="progress-bar">
        <div id="quiz-progress" class="progress-fill"></div>
      </div>
    </div>

    <div id="quiz-question-wrap">
      <p id="quiz-question"></p>
      <pre id="quiz-code-snippet" class="code-block hidden"></pre>

      <!-- Multiple choice / predict-output -->
      <div id="quiz-options"></div>

      <!-- Free text -->
      <textarea id="quiz-freetext" class="hidden" placeholder="Type your answer..."></textarea>

      <div id="quiz-feedback" class="feedback hidden"></div>

      <button id="btn-quiz-submit" class="btn btn-primary">Submit</button>
      <button id="btn-quiz-next" class="btn btn-secondary hidden">Next Question →</button>
    </div>

    <div id="quiz-complete" class="hidden">
      <div class="success-icon">✓</div>
      <p>You passed! Now let's build something.</p>
      <button id="btn-start-challenge" class="btn btn-primary">Open Challenge →</button>
    </div>
  </div>

  <!-- ── SCREEN: Quiz Fail ── -->
  <div id="screen-quiz-fail" class="screen">
    <div class="screen-header">
      <h2>Not quite</h2>
    </div>
    <p id="fail-score" style="margin:16px 0;font-size:1.1rem;"></p>
    <p style="color:var(--color-text-muted,#aaa);margin-bottom:24px;">Review the summary and give it another go.</p>
    <button id="btn-retry-quiz" class="btn btn-primary">Try Again</button>
    <button id="btn-fail-to-summary" class="btn btn-secondary" style="margin-top:8px;">Back to Summary</button>
  </div>

  <!-- ── SCREEN: Challenge + IDE ── -->
  <div id="screen-challenge" class="screen">
    <div class="screen-header">
      <span class="step-badge">Step 3 of 3</span>
      <h2 id="challenge-title"></h2>
      <button id="btn-back-challenge" class="btn btn-ghost btn-sm">← Back</button>
    </div>

    <p id="challenge-description"></p>

    <div class="ide-wrap">
      <div class="ide-toolbar">
        <span class="ide-label">JavaScript</span>
        <button id="btn-hint" class="btn btn-ghost btn-sm">💡 Hint</button>
        <button id="btn-solution" class="btn btn-ghost btn-sm">Show Solution</button>
        <button id="btn-run" class="btn btn-primary btn-sm">▶ Run</button>
      </div>
      <textarea id="ide-editor" class="ide-editor" spellcheck="false"></textarea>
      <div class="ide-output-header">Output</div>
      <div id="ide-output" class="ide-output"></div>
    </div>

    <div id="test-results" class="test-results"></div>
    <div id="hint-display" class="hint-box hidden"></div>
  </div>

  <!-- ── Sandbox iframe (hidden, used to run user code safely) ── -->
  <iframe id="sandbox" src="about:blank" sandbox="allow-scripts" style="display:none;"></iframe>

  <script src="main.js"></script>
</body>
</html>
```

- [ ] **Verify manually:**
  1. Reload the extension in `chrome://extensions`.
  2. Open the side panel directly (click the extension icon).
  3. Idle screen should show — no reset button visible.
  4. Open DevTools on the side panel (`right-click → Inspect` on the panel) and run: `document.getElementById('screen-error')` — should return an element, not `null`.
  5. Run: `document.getElementById('screen-quiz-fail')` — should return an element.
  6. Run: `document.getElementById('btn-reset')` — should return an element with class `hidden`.

- [ ] **Commit:**
```bash
git add sidepanel/index.html
git commit -m "feat: add error screen, quiz-fail screen, reset button, and back buttons to HTML"
```

---

## Task 3: Feature C — Error screen wiring + `resetState()`

**Files:**
- Modify: `sidepanel/main.js`

### What changes
- Add `showError(message)` helper.
- Add `resetState()` helper (resets `state` object + removes `savedSession` from storage).
- Replace both `alert()` calls with `showError()`.
- Wire up `#btn-retry` and `#btn-error-reset`.

- [ ] **In `main.js`, replace the existing `showScreen` function and add helpers immediately after it:**

Find this block (around line 17):
```js
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setLoadingMsg(msg) {
  document.getElementById('loading-msg').textContent = msg;
}
```

Replace with:
```js
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setLoadingMsg(msg) {
  document.getElementById('loading-msg').textContent = msg;
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  showScreen('screen-error');
}

function resetState() {
  state.transcript = null;
  state.videoTitle = null;
  state.summary = null;
  state.quiz = [];
  state.challenge = null;
  state.quizIndex = 0;
  state.quizPassed = 0;
  state.hintIndex = 0;
  state.selectedOption = null;
  chrome.storage.session.remove('savedSession');
}
```

- [ ] **In `startSession()`, replace the `alert()` call:**

Find:
```js
    alert(`Error generating session: ${response.error}`);
    showScreen('screen-idle');
```

Replace with:
```js
    showError(`Failed to generate session: ${response.error}`);
    return;
```

- [ ] **In the `EVALUATE_ANSWER` handler inside `btn-quiz-submit` click, replace the silent failure path. Find:**
```js
    if (res.ok) {
      showFeedback(res.data.passed, res.data.feedback, q.explanation);
      if (res.data.passed) state.quizPassed++;
    }
```

Replace with:
```js
    if (res.ok) {
      showFeedback(res.data.passed, res.data.feedback, q.explanation);
      if (res.data.passed) state.quizPassed++;
    } else {
      showError(`Could not evaluate answer: ${res.error}`);
    }
```

- [ ] **Wire up error screen buttons. Add after the `showFeedback` function definition:**

```js
document.getElementById('btn-retry').addEventListener('click', () => {
  startSession();
});

document.getElementById('btn-error-reset').addEventListener('click', () => {
  resetState();
  showScreen('screen-idle');
});
```

- [ ] **Verify manually:**
  1. Reload the extension.
  2. Open side panel DevTools console, run:
     ```js
     document.getElementById('btn-error-reset').click();
     ```
     Nothing should crash (it calls `resetState()` + `showScreen('screen-idle')`).
  3. Run: `showError('test error')` — the error screen should appear with "test error" in the body and two buttons.
  4. Click "Try Again" — should attempt `startSession()` (will do nothing visible since `state.transcript` is null, which is fine for now).
  5. Click "Start Over" — should return to idle screen.

- [ ] **Commit:**
```bash
git add sidepanel/main.js
git commit -m "feat: add error screen wiring and resetState helper"
```

---

## Task 4: Features E + F — Reset button + back navigation

**Files:**
- Modify: `sidepanel/main.js`

### What changes
- Update `showScreen()` to toggle `#btn-reset` visibility (hidden on idle, visible elsewhere).
- Wire `#btn-reset` to `resetState()` + idle screen.
- Wire `#btn-back-quiz` to reset quiz state + go to summary.
- Wire `#btn-back-challenge` to show the quiz-complete view on the quiz screen.

- [ ] **Update `showScreen()` to manage reset button visibility:**

Find:
```js
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
```

Replace with:
```js
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('btn-reset').classList.toggle('hidden', id === 'screen-idle');
}
```

- [ ] **Wire the reset and back buttons. Add these event listeners after the `btn-error-reset` listener from Task 3:**

```js
document.getElementById('btn-reset').addEventListener('click', () => {
  resetState();
  showScreen('screen-idle');
});

document.getElementById('btn-back-quiz').addEventListener('click', () => {
  state.quizIndex = 0;
  state.quizPassed = 0;
  state.selectedOption = null;
  showScreen('screen-summary');
});

document.getElementById('btn-back-challenge').addEventListener('click', () => {
  document.getElementById('quiz-question-wrap').classList.add('hidden');
  document.getElementById('quiz-complete').classList.remove('hidden');
  showScreen('screen-quiz');
});
```

- [ ] **Verify manually:**
  1. Reload the extension.
  2. Open side panel. Idle screen — reset button should be hidden (check top-right).
  3. In DevTools console run: `showScreen('screen-summary')` — reset button (↺) should appear top-right.
  4. Click the ↺ Reset button — should return to idle, reset button disappears.
  5. Simulate being on quiz screen: `showScreen('screen-quiz')` then click "← Back" — should go to summary screen.
  6. Simulate being on challenge screen: `showScreen('screen-challenge')` then click "← Back" — should go to quiz screen showing the quiz-complete div (green ✓).

- [ ] **Commit:**
```bash
git add sidepanel/main.js
git commit -m "feat: wire reset button and back navigation"
```

---

## Task 5: Feature B — Session persistence

**Files:**
- Modify: `sidepanel/main.js`

### What changes
- Add `persistState(currentScreen)` helper — serialises `state` to `chrome.storage.session`.
- Replace the existing startup sequence (the `chrome.storage.session.get('pendingSession')` block + `showScreen('screen-idle')`) with `restoreOrInit()`.
- Call `persistState()` at the three right moments: after session generates, after each quiz Next, after navigating to challenge.

- [ ] **Add `persistState()` and `restoreOrInit()`. Add them after `resetState()`:**

```js
function persistState(currentScreen) {
  const { videoTitle, transcript, summary, quiz, challenge, quizIndex, quizPassed } = state;
  chrome.storage.session.set({
    savedSession: { videoTitle, transcript, summary, quiz, challenge, quizIndex, quizPassed, currentScreen }
  });
}

async function restoreOrInit() {
  const { savedSession } = await chrome.storage.session.get('savedSession');
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

  const { pendingSession } = await chrome.storage.session.get('pendingSession');
  if (pendingSession) {
    chrome.storage.session.remove('pendingSession');
    state.videoTitle = pendingSession.title;
    state.transcript = pendingSession.transcript;
    startSession();
    return;
  }

  showScreen('screen-idle');
}
```

- [ ] **Replace the existing startup block at the bottom of `main.js`.**

Find and remove this entire block:
```js
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

// ── Init: check if already idle ──
showScreen('screen-idle');
```

Replace with:
```js
// ── Init ──
restoreOrInit();
```

- [ ] **Call `persistState('summary')` after `GENERATE_SESSION` succeeds. In `startSession()`, find:**
```js
  renderSummary();
  showScreen('screen-summary');
```

Replace with:
```js
  persistState('summary');
  renderSummary();
  showScreen('screen-summary');
```

- [ ] **Call `persistState('quiz')` after advancing to the next quiz question. In the `btn-quiz-next` handler, find the `else` branch:**
```js
  } else {
    renderQuizQuestion();
  }
```

Replace with:
```js
  } else {
    persistState('quiz');
    renderQuizQuestion();
  }
```

- [ ] **Call `persistState('challenge')` when the user opens the challenge. Find:**
```js
document.getElementById('btn-start-challenge').addEventListener('click', () => {
  renderChallenge();
  showScreen('screen-challenge');
});
```

Replace with:
```js
document.getElementById('btn-start-challenge').addEventListener('click', () => {
  persistState('challenge');
  renderChallenge();
  showScreen('screen-challenge');
});
```

- [ ] **Verify manually:**
  1. Reload the extension. Navigate to a YouTube video with captions, click "▶ Start LearnLoop".
  2. Wait for the summary screen to appear.
  3. Close the side panel (click the extension icon to toggle it off).
  4. Reopen the side panel — it should restore directly to the summary screen with the same content (no loading spinner).
  5. Click "Take the Quiz →", answer one question and click "Next Question →".
  6. Close and reopen the side panel — should restore to the quiz at the question you were on.
  7. Click the ↺ Reset button — close and reopen — should show idle screen (savedSession cleared).

- [ ] **Commit:**
```bash
git add sidepanel/main.js
git commit -m "feat: add session persistence with chrome.storage.session"
```

---

## Task 6: Feature D — Ctrl/Cmd+Enter to run code

**Files:**
- Modify: `sidepanel/main.js`

- [ ] **Add the keydown listener immediately after the `btn-run` click listener. Find:**
```js
document.getElementById('btn-run').addEventListener('click', () => {
  const code = document.getElementById('ide-editor').value;
  runCode(code);
});
```

Add immediately after:
```js
document.getElementById('ide-editor').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runCode(e.target.value);
  }
});
```

- [ ] **Verify manually:**
  1. Reach the challenge screen (or manually run `showScreen('screen-challenge')` in DevTools — you may need to set up some state first, or just reload with a savedSession in the challenge screen).
  2. Click inside the `#ide-editor` textarea and type any JS, e.g. `console.log('hi')`.
  3. Press Ctrl+Enter (or Cmd+Enter on Mac) — output pane should show `hi`.
  4. Press Enter alone — should insert a newline, not run.

- [ ] **Commit:**
```bash
git add sidepanel/main.js
git commit -m "feat: add Ctrl/Cmd+Enter shortcut to run code in IDE"
```

---

## Task 7: Bug #3 — Quiz pass gate + fail screen

**Files:**
- Modify: `sidepanel/main.js`

### What changes
- Add `resetQuiz()` — Fisher-Yates shuffle of `state.quiz`, resets indices, resets quiz UI.
- Update the `btn-quiz-next` handler's completion branch to check pass threshold and either show quiz-complete or the fail screen.
- Wire `#btn-retry-quiz` and `#btn-fail-to-summary`.
- Call `persistState('quiz')` on pass (quiz-complete shown).

- [ ] **Add `resetQuiz()` after `resetState()` in `main.js`:**

```js
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
```

- [ ] **Update the `btn-quiz-next` completion branch. Find:**
```js
  if (state.quizIndex >= state.quiz.length) {
    // Quiz complete
    document.getElementById('quiz-progress').style.width = '100%';
    document.getElementById('quiz-question-wrap').classList.add('hidden');
    document.getElementById('quiz-complete').classList.remove('hidden');
  } else {
    persistState('quiz');
    renderQuizQuestion();
  }
```

Replace with:
```js
  if (state.quizIndex >= state.quiz.length) {
    document.getElementById('quiz-progress').style.width = '100%';
    const threshold = Math.ceil(state.quiz.length * 0.67);
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
```

- [ ] **Wire the fail screen buttons. Add after the `btn-fail-to-summary` / `btn-retry-quiz` area (near other quiz button listeners):**

```js
document.getElementById('btn-retry-quiz').addEventListener('click', () => {
  resetQuiz();
  renderQuizQuestion();
  showScreen('screen-quiz');
});

document.getElementById('btn-fail-to-summary').addEventListener('click', () => {
  resetQuiz();
  showScreen('screen-summary');
});
```

- [ ] **Verify manually:**
  1. Complete a full session through to the quiz.
  2. Answer all three questions wrong (for multiple-choice, pick an obviously wrong option each time).
  3. After the third Next click, the "Not quite" fail screen should appear with a score like "You got 0 of 3 — need 2 to continue."
  4. Click "Try Again" — quiz screen should reappear, questions may appear in a different order (shuffled). The progress bar should be at 0%.
  5. Answer at least 2 of 3 correctly — after the third Next click, the green ✓ quiz-complete screen should appear.
  6. Click "Open Challenge →" — should land on the challenge screen.

- [ ] **Commit:**
```bash
git add sidepanel/main.js
git commit -m "fix: enforce quiz pass gate (2/3 correct) with retry fail screen"
```

---

## Self-Review

**Spec coverage:**
- Feature A (injected button + 30% gate): Task 1 ✅
- Feature C (error screen): Task 3 ✅
- Feature E (reset button): Task 4 ✅
- Feature F (back navigation): Task 4 ✅
- Feature B (session persistence): Task 5 ✅
- Feature D (Ctrl+Enter): Task 6 ✅
- Bug #3 (pass gate + fail screen): Task 7 ✅
- `resetState()` clears `savedSession`: Tasks 3 + 4 ✅
- `persistState()` not called on fail: Task 7 — the fail branch does not call `persistState()` ✅
- Restore handles `quizIndex >= quiz.length` (passed but panel closed before challenge): Task 5 `restoreOrInit()` ✅

**Placeholder scan:** No TBDs, all code is complete and specific.

**Type/name consistency:**
- `resetState()` defined in Task 3, used in Tasks 3, 4 ✅
- `resetQuiz()` defined in Task 7, used in Task 7 ✅
- `persistState(currentScreen)` defined in Task 5, used in Tasks 5, 7 ✅
- `showError(message)` defined in Task 3, used in Task 3 ✅
- `restoreOrInit()` defined and called in Task 5 ✅
- `#btn-reset`, `#screen-error`, `#screen-quiz-fail`, `#btn-back-quiz`, `#btn-back-challenge` all added in Task 2 HTML before any JS wiring in Tasks 3–7 ✅
