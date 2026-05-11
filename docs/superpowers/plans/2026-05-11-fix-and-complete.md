# LearnLoop — Fix All & Build All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all outstanding bugs and implement every remaining feature in the LearnLoop Chrome extension as specified in `docs/superpowers/specs/2026-05-11-fix-and-complete-design.md`.

**Architecture:** Timestamps are threaded end-to-end from YouTube's caption XML through the AI quiz prompts to clickable links in the UI. CodeMirror 5 replaces the plain textarea. A new options page owns all advanced settings; the popup becomes a status widget.

**Tech Stack:** Manifest V3 Chrome Extension, vanilla JS ES modules, CodeMirror 5 (local vendor files), Chrome Storage/Scripting/SidePanel APIs.

---

## Task 1: Quick-win bug fixes (sandbox guard + no-transcript tooltip + dead file)

**Files:**
- Modify: `sidepanel/main.js`
- Modify: `content/content.js`
- Delete: `ai/openai.js`

- [ ] **Step 1: Add sandbox origin guard in main.js**

In `sidepanel/main.js`, find the `window.addEventListener('message', ...)` handler (currently around line 376). Add a source check as the second guard:

```js
// Listen for results from sandbox
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'RUN_RESULT') return;
  if (event.source !== document.getElementById('sandbox').contentWindow) return;

  const { logs, testResults } = event.data;
  // ... rest unchanged
```

- [ ] **Step 2: Add error tooltip in content.js when transcript fails**

In `content/content.js`, replace the `triggerSession` error handler (the `catch` block that just logs a warning) with one that also shows a tooltip:

```js
async function triggerSession(videoId) {
  if (isTriggering || sessionStarted) return;
  isTriggering = true;

  const title = getVideoTitle();
  let transcript = null;
  try {
    transcript = await fetchTranscript(videoId);
  } catch (e) {
    console.warn('[LearnLoop] Could not fetch transcript:', e.message);
    isTriggering = false;
    showButtonError('No captions found — captions are required');
    return;
  }

  teardown();
  sessionStarted = true;
  chrome.runtime.sendMessage({
    type: 'VIDEO_DETECTED',
    payload: { videoId, title, transcript },
  });
}
```

Add the `showButtonError` function anywhere in the IIFE (after `teardown`):

```js
function showButtonError(msg) {
  if (!startButton) return;
  const tip = document.createElement('div');
  tip.textContent = msg;
  Object.assign(tip.style, {
    position: 'fixed',
    bottom: '130px',
    right: '20px',
    zIndex: '10000',
    background: '#1a1a22',
    color: '#e05c5c',
    border: '1px solid #e05c5c',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    maxWidth: '220px',
    lineHeight: '1.4',
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
  });
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 4000);
}
```

- [ ] **Step 3: Delete the dead re-export file**

```bash
rm ai/openai.js
```

- [ ] **Step 4: Verify the extension loads without errors**

Load the extension at `chrome://extensions` (or reload it). Open a YouTube video. Open DevTools on the background service worker. Confirm no "Cannot resolve module" errors appear.

- [ ] **Step 5: Commit**

```bash
git add sidepanel/main.js content/content.js
git rm ai/openai.js
git commit -m "fix: sandbox origin guard, no-transcript tooltip, remove dead openai.js shim"
```

---

## Task 2: SVG icons + manifest icon paths

**Files:**
- Create: `icons/icon16.svg`
- Create: `icons/icon48.svg`
- Create: `icons/icon128.svg`
- Modify: `manifest.json`

- [ ] **Step 1: Create icon16.svg**

```svg
<!-- icons/icon16.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">
  <path d="M4 8 C4 5.5 6 3.5 8 5.5 C10 7.5 12 5.5 12 8 C12 10.5 10 12.5 8 10.5 C6 8.5 4 10.5 4 8Z"
        stroke="#7c6af7" stroke-width="1.5" fill="none"/>
  <polygon points="7,6.5 7,9.5 10,8" fill="#a78bfa"/>
</svg>
```

- [ ] **Step 2: Create icon48.svg**

```svg
<!-- icons/icon48.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <path d="M8 24 C8 15.5 16 9.5 24 17.5 C32 25.5 40 19.5 40 28 C40 36.5 32 42.5 24 34.5 C16 26.5 8 32.5 8 24Z"
        stroke="#7c6af7" stroke-width="3" fill="none" stroke-linecap="round"/>
  <polygon points="21,19 21,29 31,24" fill="#a78bfa"/>
</svg>
```

- [ ] **Step 3: Create icon128.svg**

```svg
<!-- icons/icon128.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <path d="M18 64 C18 40 40 24 64 46 C88 68 110 52 110 76 C110 100 88 116 64 94 C40 72 18 88 18 64Z"
        stroke="#7c6af7" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <polygon points="56,50 56,78 82,64" fill="#a78bfa"/>
</svg>
```

- [ ] **Step 4: Update manifest.json icon paths**

In `manifest.json`, update the `"action"` icon block and top-level `"icons"` block to use SVG:

```json
"action": {
  "default_popup": "popup/index.html",
  "default_icon": {
    "16": "icons/icon16.svg",
    "48": "icons/icon48.svg",
    "128": "icons/icon128.svg"
  }
},

"icons": {
  "16": "icons/icon16.svg",
  "48": "icons/icon48.svg",
  "128": "icons/icon128.svg"
},
```

- [ ] **Step 5: Verify icons appear in Chrome**

Reload the extension. Confirm the infinity-loop icon appears in the toolbar and on the `chrome://extensions` page.

- [ ] **Step 6: Commit**

```bash
git add icons/icon16.svg icons/icon48.svg icons/icon128.svg manifest.json
git commit -m "feat: replace placeholder icons with infinity-loop SVG design"
```

---

## Task 3: Transcript format — `parseTranscriptXML` returns `Segment[]`

**Files:**
- Modify: `content/content.js`

The entire transcript pipeline changes here. `fetchTranscript` will now return `Segment[]` (`{ t: number, text: string }[]`) instead of a plain string. Everything downstream (background.js, main.js) will be updated in subsequent tasks.

- [ ] **Step 1: Update `parseTranscriptXML` in content.js**

Replace the existing `parseTranscriptXML` function with:

```js
function parseTranscriptXML(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  return Array.from(doc.querySelectorAll('text'))
    .map(el => ({
      t: parseFloat(el.getAttribute('start') || '0'),
      text: el.textContent.replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim(),
    }))
    .filter(seg => seg.text);
}
```

No other changes to `content.js` in this task — `triggerSession` already passes `transcript` straight through in `message.payload`, so it will now forward a `Segment[]` without any modification needed.

- [ ] **Step 2: Verify content.js still works end-to-end**

Load the extension. Open a YouTube video with captions. Click "▶ Start LearnLoop". In the background service worker DevTools console, add a temporary `console.log` to the `VIDEO_DETECTED` case to confirm `message.payload.transcript` is now an array of `{ t, text }` objects. Remove the log after verifying.

- [ ] **Step 3: Commit**

```bash
git add content/content.js
git commit -m "feat: transcript now returns Segment[] with timestamps from caption XML"
```

---

## Task 4: `background.js` — tabId in session, transcript helpers, SEEK_VIDEO handler

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add transcript helper functions at the top of background.js**

Add these two functions after the import line:

```js
function transcriptToPlainText(segments) {
  return segments.map(s => s.text).join(' ');
}

function transcriptToTimestamped(segments, maxChars = 6000) {
  let out = '';
  for (const seg of segments) {
    const m = Math.floor(seg.t / 60);
    const s = Math.floor(seg.t % 60).toString().padStart(2, '0');
    const line = `[${m}:${s}] ${seg.text}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out;
}
```

- [ ] **Step 2: Include tabId in pendingSession**

In the `VIDEO_DETECTED` handler, spread `tabId` into the session payload:

```js
case 'VIDEO_DETECTED': {
  chrome.storage.session.set({ pendingSession: { ...message.payload, tabId: sender.tab.id } })
    .then(() => chrome.sidePanel.open({ tabId: sender.tab.id }))
    .then(() => sendResponse({ ok: true }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
}
```

- [ ] **Step 3: Update handleGenerateSession to pass both transcript forms**

Replace the existing `handleGenerateSession` function:

```js
async function handleGenerateSession({ transcript, videoTitle }) {
  const ai = await getAIProvider();
  const plainText = transcriptToPlainText(transcript);
  const timestampedText = transcriptToTimestamped(transcript);

  const [summary, quiz, challenge] = await Promise.all([
    ai.generateSummary(plainText, videoTitle),
    ai.generateQuiz(plainText, timestampedText, videoTitle),
    ai.generateChallenge(plainText, videoTitle),
  ]);

  return { summary, quiz, challenge };
}
```

`handleEvaluateAnswer` receives plain text from `main.js` (converted there), so it is unchanged.

- [ ] **Step 4: Add SEEK_VIDEO message handler**

Add a new case to the message router, before the `default` case:

```js
case 'SEEK_VIDEO': {
  const { t, tabId } = message.payload;
  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (seconds) => {
      const video = document.querySelector('video');
      if (video) video.currentTime = seconds;
    },
    args: [t],
  })
    .then(() => sendResponse({ ok: true }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
}
```

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "feat: add transcript helpers, tabId in session, SEEK_VIDEO handler"
```

---

## Task 5: AI providers — update `generateQuiz` signature and prompts

**Files:**
- Modify: `ai/provider.js`
- Modify: `ai/anthropic.js`
- Modify: `ai/openai-compatible.js`
- Modify: `ai/gemini.js`

- [ ] **Step 1: Update provider.js base class JSDoc**

In `ai/provider.js`, update the `generateQuiz` JSDoc:

```js
/**
 * Generate a quiz to test understanding before the user can code.
 * @param {string} plainText - Full video transcript as plain text
 * @param {string} timestampedText - Transcript with [m:ss] prefixes, capped ~6000 chars
 * @param {string} videoTitle
 * @returns {Promise<Question[]>}
 */
async generateQuiz(plainText, timestampedText, videoTitle) {
  throw new Error('generateQuiz() must be implemented by the provider');
}
```

- [ ] **Step 2: Update anthropic.js generateQuiz**

Replace the `generateQuiz` method in `ai/anthropic.js`:

```js
async generateQuiz(plainText, timestampedText, videoTitle) {
  const difficultyInstruction = {
    easy: 'Create straightforward recall questions that test basic understanding.',
    medium: 'Create a mix of recall and application questions.',
    hard: 'Create application and edge-case questions that require deep understanding of the concept.',
  }[this.config.difficulty || 'medium'];

  const system = `You are an expert coding tutor creating a quiz. ${difficultyInstruction} Focus on the "why" behind concepts, not rote memorisation. Return JSON only.

When writing an explanation, if you reference a moment in the video, include a timestamp marker in the format [t=Ns] where N is the number of seconds (e.g. [t=272s]). Only use timestamps that appear in the provided transcript.`;

  const user = `Video title: "${videoTitle}"
Timestamped transcript:
${timestampedText}

Generate 3 quiz questions. Mix types: at least one multiple-choice, one predict-output (show a code snippet and ask what it outputs), and one free-text conceptual question.

Return ONLY a JSON array:
[
  {
    "id": "q1",
    "type": "multiple-choice",
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctOption": 0,
    "explanation": "..."
  },
  {
    "id": "q2",
    "type": "predict-output",
    "question": "What does this code output?",
    "codeSnippet": "...",
    "options": ["output A", "output B", "output C", "output D"],
    "correctOption": 2,
    "explanation": "..."
  },
  {
    "id": "q3",
    "type": "free-text",
    "question": "...",
    "explanation": "A good answer would mention..."
  }
]`;
  return this._parseJSON(await this._call(system, user));
}
```

- [ ] **Step 3: Update openai-compatible.js generateQuiz**

Replace the `generateQuiz` method in `ai/openai-compatible.js` with the identical implementation (same body, different class):

```js
async generateQuiz(plainText, timestampedText, videoTitle) {
  const difficultyInstruction = {
    easy: 'Create straightforward recall questions that test basic understanding.',
    medium: 'Create a mix of recall and application questions.',
    hard: 'Create application and edge-case questions that require deep understanding of the concept.',
  }[this.config.difficulty || 'medium'];

  const system = `You are an expert coding tutor creating a quiz. ${difficultyInstruction} Focus on the "why" behind concepts, not rote memorisation. Return JSON only.

When writing an explanation, if you reference a moment in the video, include a timestamp marker in the format [t=Ns] where N is the number of seconds (e.g. [t=272s]). Only use timestamps that appear in the provided transcript.`;

  const user = `Video title: "${videoTitle}"
Timestamped transcript:
${timestampedText}

Generate 3 quiz questions. Mix types: at least one multiple-choice, one predict-output (show a code snippet and ask what it outputs), and one free-text conceptual question.

Return ONLY a JSON array:
[
  {
    "id": "q1",
    "type": "multiple-choice",
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctOption": 0,
    "explanation": "..."
  },
  {
    "id": "q2",
    "type": "predict-output",
    "question": "What does this code output?",
    "codeSnippet": "...",
    "options": ["output A", "output B", "output C", "output D"],
    "correctOption": 2,
    "explanation": "..."
  },
  {
    "id": "q3",
    "type": "free-text",
    "question": "...",
    "explanation": "A good answer would mention..."
  }
]`;
  return this._parseJSON(await this._call(system, user));
}
```

- [ ] **Step 4: Update gemini.js generateQuiz**

Replace the `generateQuiz` method in `ai/gemini.js` with the same body:

```js
async generateQuiz(plainText, timestampedText, videoTitle) {
  const difficultyInstruction = {
    easy: 'Create straightforward recall questions that test basic understanding.',
    medium: 'Create a mix of recall and application questions.',
    hard: 'Create application and edge-case questions that require deep understanding of the concept.',
  }[this.config.difficulty || 'medium'];

  const system = `You are an expert coding tutor creating a quiz. ${difficultyInstruction} Focus on the "why" behind concepts, not rote memorisation. Return JSON only.

When writing an explanation, if you reference a moment in the video, include a timestamp marker in the format [t=Ns] where N is the number of seconds (e.g. [t=272s]). Only use timestamps that appear in the provided transcript.`;

  const user = `Video title: "${videoTitle}"
Timestamped transcript:
${timestampedText}

Generate 3 quiz questions. Mix types: at least one multiple-choice, one predict-output (show a code snippet and ask what it outputs), and one free-text conceptual question.

Return ONLY a JSON array:
[
  {
    "id": "q1",
    "type": "multiple-choice",
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctOption": 0,
    "explanation": "..."
  },
  {
    "id": "q2",
    "type": "predict-output",
    "question": "What does this code output?",
    "codeSnippet": "...",
    "options": ["output A", "output B", "output C", "output D"],
    "correctOption": 2,
    "explanation": "..."
  },
  {
    "id": "q3",
    "type": "free-text",
    "question": "...",
    "explanation": "A good answer would mention..."
  }
]`;
  return this._parseJSON(await this._call(system, user));
}
```

- [ ] **Step 5: Commit**

```bash
git add ai/provider.js ai/anthropic.js ai/openai-compatible.js ai/gemini.js
git commit -m "feat: generateQuiz accepts timestamped transcript and difficulty setting"
```

---

## Task 6: `main.js` — state.tabId, transcriptToPlainText, renderExplanation, predict-output mode

**Files:**
- Modify: `sidepanel/main.js`
- Modify: `sidepanel/style.css`

- [ ] **Step 1: Add tabId to state and resetState**

In `sidepanel/main.js`, update the `state` object to include `tabId`:

```js
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
```

Update `resetState()` to also clear `tabId`:

```js
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
```

Update `persistState` to include `tabId`:

```js
function persistState(currentScreen) {
  const { videoTitle, transcript, tabId, summary, quiz, challenge, quizIndex, quizPassed } = state;
  chrome.storage.session.set({
    savedSession: { videoTitle, transcript, tabId, summary, quiz, challenge, quizIndex, quizPassed, currentScreen }
  }).catch(e => console.error('[LearnLoop] persistState failed:', e));
}
```

- [ ] **Step 2: Set state.tabId in restoreOrInit**

In `restoreOrInit`, update the `pendingSession` branch to capture `tabId`:

```js
if (pendingSession) {
  chrome.storage.session.remove(['pendingSession', 'savedSession']);
  state.videoTitle = pendingSession.title;
  state.transcript = pendingSession.transcript;
  state.tabId = pendingSession.tabId;
  startSession();
  return;
}
```

The `savedSession` branch uses `Object.assign(state, savedSession)` which already restores `tabId` when present.

- [ ] **Step 3: Add transcriptToPlainText helper and update EVALUATE_ANSWER call**

Add this function near the top of `main.js`, after the `state` object:

```js
function transcriptToPlainText(segments) {
  if (!Array.isArray(segments)) return segments ?? '';
  return segments.map(s => s.text).join(' ');
}
```

In the `btn-quiz-submit` click handler, update the `EVALUATE_ANSWER` payload to convert the transcript:

```js
const res = await chrome.runtime.sendMessage({
  type: 'EVALUATE_ANSWER',
  payload: {
    question: q.question,
    userAnswer: answer,
    transcript: transcriptToPlainText(state.transcript),
  },
});
```

- [ ] **Step 4: Add renderExplanation helper**

Add this function after `transcriptToPlainText`:

```js
function renderExplanation(text, containerEl) {
  const parts = text.split(/(\[t=\d+s\])/g);
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
```

- [ ] **Step 5: Update showFeedback to use renderExplanation**

Replace the existing `showFeedback` function:

```js
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
```

Update both call sites to the new 2-argument signature:
- Multiple choice: `showFeedback(passed, q.explanation);`
- Free text: `showFeedback(res.data.passed, res.data.feedback);`

- [ ] **Step 6: Implement predict-output text-input mode**

In `renderQuizQuestion`, change the type-dispatch block from:

```js
if (q.type === 'multiple-choice' || q.type === 'predict-output') {
  renderOptions(q);
} else if (q.type === 'free-text') {
  document.getElementById('quiz-freetext').classList.remove('hidden');
}
```

To:

```js
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
```

In the `btn-quiz-submit` click handler, add a `predict-output` branch between the `free-text` and `else` blocks:

```js
if (q.type === 'free-text') {
  // ... existing AI evaluation code, unchanged ...
} else if (q.type === 'predict-output') {
  const answer = document.getElementById('quiz-freetext').value.trim();
  if (!answer) { btn.disabled = false; return; }
  const correct = String(q.options[q.correctOption]).trim();
  const passed = answer === correct;
  if (passed) state.quizPassed++;
  showFeedback(passed, q.explanation);
  btn.disabled = false;
} else {
  // multiple-choice — existing code unchanged
}
```

- [ ] **Step 7: Add timestamp link styles to style.css**

Append to `sidepanel/style.css`:

```css
/* ── Timestamp links (in quiz feedback) ── */
.timestamp-link {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.8em;
  background: rgba(124, 106, 247, 0.12);
  border: 1px solid rgba(124, 106, 247, 0.3);
  border-radius: 4px;
  padding: 1px 5px;
  margin: 0 2px;
  cursor: pointer;
  display: inline-block;
  vertical-align: baseline;
}

.timestamp-link:hover {
  background: rgba(124, 106, 247, 0.25);
}
```

- [ ] **Step 8: Commit**

```bash
git add sidepanel/main.js sidepanel/style.css
git commit -m "feat: timestamp links in quiz feedback, predict-output text mode, tabId tracking"
```

---

## Task 7: CodeMirror 5 — download vendor files

**Files:**
- Create: `sidepanel/vendor/codemirror.min.js`
- Create: `sidepanel/vendor/codemirror.min.css`
- Create: `sidepanel/vendor/javascript.min.js`

- [ ] **Step 1: Create vendor directory and download files**

```bash
mkdir -p sidepanel/vendor
curl -sL "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js" -o sidepanel/vendor/codemirror.min.js
curl -sL "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css" -o sidepanel/vendor/codemirror.min.css
curl -sL "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js" -o sidepanel/vendor/javascript.min.js
```

- [ ] **Step 2: Verify files downloaded correctly**

```bash
wc -c sidepanel/vendor/codemirror.min.js sidepanel/vendor/codemirror.min.css sidepanel/vendor/javascript.min.js
```

Expected: codemirror.min.js ~155KB, codemirror.min.css ~10KB, javascript.min.js ~25KB. All three should be non-zero.

- [ ] **Step 3: Commit**

```bash
git add sidepanel/vendor/
git commit -m "chore: add CodeMirror 5 vendor files (JS syntax highlighting)"
```

---

## Task 8: CodeMirror 5 — integrate into sidepanel

**Files:**
- Modify: `sidepanel/index.html`
- Modify: `sidepanel/main.js`
- Modify: `sidepanel/style.css`

- [ ] **Step 1: Update index.html — load CM assets and replace textarea**

In `sidepanel/index.html`:

1. In `<head>`, after the existing `<link rel="stylesheet" href="style.css" />`, add:
```html
<link rel="stylesheet" href="vendor/codemirror.min.css" />
```

2. In the IDE section, replace the `<textarea id="ide-editor" ...>` with a wrapper div:
```html
<div id="ide-editor-wrap"></div>
```

3. Before `<script src="main.js"></script>`, add:
```html
<script src="vendor/codemirror.min.js"></script>
<script src="vendor/javascript.min.js"></script>
```

- [ ] **Step 2: Initialise CodeMirror in main.js**

At the top of `sidepanel/main.js`, add a module-level variable:

```js
let editor; // CodeMirror instance, set on DOMContentLoaded
```

Add an initialisation block near the bottom of the file, before the `restoreOrInit()` call:

```js
// ── CodeMirror init ──
editor = CodeMirror(document.getElementById('ide-editor-wrap'), {
  mode: 'javascript',
  lineNumbers: true,
  matchBrackets: true,
  indentWithTabs: false,
  tabSize: 2,
  theme: 'default',
  extraKeys: {
    'Ctrl-Enter': () => runCode(editor.getValue()),
    'Cmd-Enter':  () => runCode(editor.getValue()),
  },
});
```

- [ ] **Step 3: Replace textarea reads/writes with editor API**

Find and update every reference to `ide-editor`:

In `renderChallenge`:
```js
editor.setValue(challenge.starterCode);
```
(remove the old `document.getElementById('ide-editor').value = challenge.starterCode`)

In `btn-run` click handler:
```js
document.getElementById('btn-run').addEventListener('click', () => {
  runCode(editor.getValue());
});
```

In `runCode`:
```js
function runCode(userCode) {
  document.getElementById('ide-output').textContent = '';
  document.getElementById('test-results').replaceChildren();

  const sandbox = document.getElementById('sandbox');
  sandbox.contentWindow.postMessage({
    type: 'RUN_CODE',
    code: userCode,
    tests: state.challenge.tests,
  }, '*');
}
```

Remove the old `document.getElementById('ide-editor').addEventListener('keydown', ...)` block entirely (Ctrl+Enter is now handled via `extraKeys` above).

In `btn-solution` click handler:
```js
document.getElementById('btn-solution').addEventListener('click', () => {
  const { challenge } = state;
  if (confirm('Show the solution? Try the hints first!')) {
    editor.setValue(challenge.solution);
  }
});
```

- [ ] **Step 4: Style CodeMirror to match the dark IDE theme**

Append to `sidepanel/style.css`:

```css
/* ── CodeMirror dark theme overrides ── */
.CodeMirror {
  height: auto;
  min-height: 200px;
  max-height: 340px;
  background: var(--surface) !important;
  color: #c9d1d9 !important;
  font-family: var(--font-mono) !important;
  font-size: 12.5px !important;
  line-height: 1.6 !important;
  border: none !important;
}

.CodeMirror-scroll {
  min-height: 200px;
}

.CodeMirror-gutters {
  background: #12121a !important;
  border-right: 1px solid var(--border) !important;
}

.CodeMirror-linenumber {
  color: var(--text-muted) !important;
  padding: 0 8px !important;
}

.CodeMirror-cursor {
  border-left: 2px solid var(--accent) !important;
}

.CodeMirror-selected {
  background: rgba(124, 106, 247, 0.2) !important;
}

.CodeMirror-focused .CodeMirror-selected {
  background: rgba(124, 106, 247, 0.25) !important;
}
```

- [ ] **Step 5: Verify the IDE works**

Load the extension. Go through the full flow to the challenge screen. Confirm:
- Editor renders with line numbers
- JavaScript syntax highlighting is applied
- Ctrl+Enter (or Cmd+Enter) runs the code
- Run button works
- Show Solution populates the editor correctly

- [ ] **Step 6: Commit**

```bash
git add sidepanel/index.html sidepanel/main.js sidepanel/style.css
git commit -m "feat: replace textarea IDE with CodeMirror 5 (syntax highlighting, line numbers)"
```

---

## Task 9: Options page

**Files:**
- Create: `options/index.html`
- Create: `options/options.js`
- Create: `options/options.css`
- Modify: `manifest.json`
- Modify: `sidepanel/index.html` (add "More settings →" link)

- [ ] **Step 1: Create options/options.css**

```css
/* options/options.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0f0f13;
  --surface: #1a1a22;
  --surface2: #22222e;
  --border: #2e2e3e;
  --accent: #7c6af7;
  --accent-hover: #9585ff;
  --success: #3dba77;
  --error: #e05c5c;
  --text: #e8e8f0;
  --text-muted: #888899;
  --radius: 8px;
}

html, body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.6;
}

.container {
  max-width: 560px;
  margin: 0 auto;
  padding: 32px 24px 48px;
}

h1 {
  font-size: 22px;
  font-weight: 800;
  color: var(--accent);
  margin-bottom: 28px;
  letter-spacing: -0.3px;
}

.section {
  margin-bottom: 28px;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.section h2 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 14px;
}

.field:last-child { margin-bottom: 0; }

.field label {
  font-size: 12px;
  color: var(--text-muted);
}

.field select,
.field input[type="password"],
.field input[type="text"] {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 13px;
  padding: 8px 10px;
  outline: none;
  width: 100%;
}

.field select:focus,
.field input:focus { border-color: var(--accent); }

.field-toggle {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.field-toggle label { font-size: 13px; color: var(--text); }

input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}

.optional { opacity: 0.6; font-size: 11px; }

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 24px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-primary:hover { background: var(--accent-hover); }

#status {
  margin-top: 10px;
  font-size: 13px;
  min-height: 18px;
  color: var(--success);
}

#status.error { color: var(--error); }

#watch-pct-field { transition: opacity 0.2s; }
#watch-pct-field.disabled { opacity: 0.4; pointer-events: none; }
```

- [ ] **Step 2: Create options/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LearnLoop Settings</title>
  <link rel="stylesheet" href="options.css" />
</head>
<body>
  <div class="container">
    <h1>⟳ LearnLoop Settings</h1>

    <div class="section">
      <h2>AI Provider</h2>
      <div class="field">
        <label for="provider">Provider</label>
        <select id="provider">
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="openrouter">OpenRouter (free models available)</option>
          <option value="groq">Groq (fast · free tier)</option>
          <option value="gemini">Google Gemini</option>
        </select>
      </div>
      <div class="field">
        <label for="api-key">API Key</label>
        <input type="password" id="api-key" placeholder="Paste your API key…" autocomplete="off" />
      </div>
      <div id="model-field-container" class="field">
        <!-- dynamically populated by options.js -->
      </div>
    </div>

    <div class="section">
      <h2>Quiz</h2>
      <div class="field">
        <label for="difficulty">Difficulty</label>
        <select id="difficulty">
          <option value="easy">Easy — recall questions</option>
          <option value="medium" selected>Medium — mix of recall and application</option>
          <option value="hard">Hard — application and edge cases</option>
        </select>
      </div>
    </div>

    <div class="section">
      <h2>Trigger</h2>
      <div class="field field-toggle">
        <label for="auto-start">Auto-start (no button needed)</label>
        <input type="checkbox" id="auto-start" />
      </div>
      <div class="field" id="watch-pct-field">
        <label for="watch-pct">Minimum watched: <strong id="watch-pct-val">0%</strong></label>
        <input type="range" id="watch-pct" min="0" max="90" step="5" value="0" />
      </div>
    </div>

    <button class="btn-primary" id="btn-save">Save Settings</button>
    <p id="status"></p>
  </div>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create options/options.js**

```js
// options/options.js

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
  container.innerHTML = '';

  const label = document.createElement('label');
  label.setAttribute('for', 'setting-model');
  const models = PROVIDER_MODELS[provider];

  if (models == null) {
    label.innerHTML = 'Model <span class="optional">(optional)</span>';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'setting-model';
    input.placeholder = 'e.g. meta-llama/llama-3.3-70b-instruct:free';
    if (savedModel) input.value = savedModel;
    container.appendChild(label);
    container.appendChild(input);
  } else {
    label.textContent = 'Model';
    const select = document.createElement('select');
    select.id = 'setting-model';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      if (savedModel === m.id) opt.selected = true;
      select.appendChild(opt);
    });
    container.appendChild(label);
    container.appendChild(select);
  }
}

function syncWatchPctField() {
  const autoStart = document.getElementById('auto-start').checked;
  document.getElementById('watch-pct-field').classList.toggle('disabled', !autoStart);
}

// ── Init: load saved config ──
chrome.storage.local.get('llmConfig', ({ llmConfig }) => {
  const cfg = llmConfig || {};
  const provider = cfg.provider || 'anthropic';

  document.getElementById('provider').value = provider;
  document.getElementById('api-key').value = cfg.apiKey || '';
  updateModelField(provider, cfg.model || '');
  document.getElementById('difficulty').value = cfg.difficulty || 'medium';
  document.getElementById('auto-start').checked = !!cfg.autoStart;
  document.getElementById('watch-pct').value = cfg.minWatchPct ?? 0;
  document.getElementById('watch-pct-val').textContent = `${cfg.minWatchPct ?? 0}%`;
  syncWatchPctField();
});

// ── Live updates ──
document.getElementById('provider').addEventListener('change', (e) => {
  updateModelField(e.target.value, '');
});

document.getElementById('auto-start').addEventListener('change', syncWatchPctField);

document.getElementById('watch-pct').addEventListener('input', (e) => {
  document.getElementById('watch-pct-val').textContent = `${e.target.value}%`;
});

// ── Save ──
document.getElementById('btn-save').addEventListener('click', () => {
  const provider = document.getElementById('provider').value;
  const apiKey = document.getElementById('api-key').value.trim();
  const model = document.getElementById('setting-model').value.trim();
  const difficulty = document.getElementById('difficulty').value;
  const autoStart = document.getElementById('auto-start').checked;
  const minWatchPct = parseInt(document.getElementById('watch-pct').value, 10);
  const statusEl = document.getElementById('status');

  if (!apiKey) {
    statusEl.className = 'error';
    statusEl.textContent = 'API key is required.';
    return;
  }

  const config = { provider, apiKey, difficulty, autoStart, minWatchPct };
  if (model) config.model = model;

  chrome.storage.local.set({ llmConfig: config }, () => {
    statusEl.className = '';
    statusEl.textContent = 'Saved!';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  });
});
```

- [ ] **Step 4: Register the options page in manifest.json**

Add `"options_page": "options/index.html"` to `manifest.json`, alongside the other top-level keys:

```json
"options_page": "options/index.html",
```

- [ ] **Step 5: Add "More settings →" link to the in-panel settings**

In `sidepanel/index.html`, add a link below the `btn-save-settings` button inside the `.settings-panel`:

```html
<button id="btn-save-settings" class="btn btn-primary" style="width:100%;margin-top:4px;">Save</button>
<p id="settings-status" class="settings-status"></p>
<p style="text-align:center;margin-top:10px;">
  <a id="btn-more-settings" href="#" style="font-size:12px;color:var(--text-muted);">More settings →</a>
</p>
```

In `sidepanel/main.js`, add the click handler near the other settings event listeners:

```js
document.getElementById('btn-more-settings').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
```

- [ ] **Step 6: Verify the options page works**

Reload the extension. Right-click the extension icon → "Options" (or navigate to the options page via the in-panel link). Confirm:
- All fields load saved values
- Provider change updates model dropdown
- Range slider live-updates the % label
- Auto-start toggle disables the watch % field when unchecked
- Save stores all fields correctly (inspect via `chrome.storage.local.get('llmConfig')` in DevTools)

- [ ] **Step 7: Commit**

```bash
git add options/ manifest.json sidepanel/index.html sidepanel/main.js
git commit -m "feat: options page with difficulty, auto-start, watch%, and More Settings link"
```

---

## Task 10: Popup redesign — status widget

**Files:**
- Modify: `popup/index.html`
- Modify: `popup/popup.js`

- [ ] **Step 1: Rewrite popup/index.html as a status widget**

Replace the entire contents of `popup/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>LearnLoop</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 260px;
      padding: 16px;
      background: #0f0f13;
      color: #e8e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
    }
    .logo {
      font-size: 17px;
      font-weight: 800;
      color: #7c6af7;
      margin-bottom: 14px;
      letter-spacing: -0.3px;
    }
    .status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: #1a1a22;
      border: 1px solid #2e2e3e;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #3dba77;
    }
    .dot.unconfigured { background: #888899; }
    .status-text {
      font-size: 12px;
      color: #888899;
      line-height: 1.3;
    }
    .status-text strong { color: #e8e8f0; display: block; }
    .btn {
      display: block;
      width: 100%;
      padding: 9px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      margin-bottom: 8px;
    }
    .btn-primary { background: #7c6af7; color: #fff; }
    .btn-primary:hover { background: #9585ff; }
    .btn-secondary {
      background: transparent;
      color: #888899;
      border: 1px solid #2e2e3e;
    }
    .btn-secondary:hover { color: #e8e8f0; border-color: #7c6af7; }
  </style>
</head>
<body>
  <div class="logo">⟳ LearnLoop</div>
  <div class="status-row">
    <div class="dot" id="status-dot"></div>
    <div class="status-text">
      <strong id="status-provider">Not configured</strong>
      <span id="status-model"></span>
    </div>
  </div>
  <button class="btn btn-primary" id="btn-panel">Open Side Panel</button>
  <button class="btn btn-secondary" id="btn-settings">⚙ Settings</button>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Rewrite popup/popup.js**

Replace the entire contents of `popup/popup.js`:

```js
// popup/popup.js — Status widget

const PROVIDER_LABELS = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  gemini: 'Google Gemini',
};

// Show current config status
chrome.storage.local.get('llmConfig', ({ llmConfig }) => {
  const dot = document.getElementById('status-dot');
  const providerEl = document.getElementById('status-provider');
  const modelEl = document.getElementById('status-model');

  if (llmConfig?.apiKey) {
    providerEl.textContent = PROVIDER_LABELS[llmConfig.provider] || llmConfig.provider;
    modelEl.textContent = llmConfig.model || 'default model';
    dot.classList.remove('unconfigured');
  } else {
    providerEl.textContent = 'Not configured';
    modelEl.textContent = 'Open Settings to add your API key';
    dot.classList.add('unconfigured');
  }
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('btn-panel').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) {
      chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  });
});
```

- [ ] **Step 3: Verify the popup**

Click the extension toolbar icon. Confirm:
- Shows provider name + model when configured
- Shows "Not configured" with grey dot when no API key
- "Open Side Panel" opens the side panel and closes the popup
- "⚙ Settings" opens the options page

- [ ] **Step 4: Commit**

```bash
git add popup/index.html popup/popup.js
git commit -m "feat: popup redesigned as status widget with Open Panel and Settings buttons"
```

---

## Task 11: Auto-start feature in content.js

**Files:**
- Modify: `content/content.js`

- [ ] **Step 1: Update onNewVideo to read llmConfig and branch on autoStart**

Replace the `onNewVideo` function with:

```js
async function onNewVideo(videoId) {
  if (sessionStarted) return;
  await sleep(2000);
  if (videoId !== lastVideoId) return;

  const { llmConfig } = await chrome.storage.local.get('llmConfig');
  if (llmConfig?.autoStart) {
    watchForAutoStart(videoId, llmConfig.minWatchPct ?? 0);
  } else {
    injectStartButton(videoId);
  }
}
```

- [ ] **Step 2: Add watchForAutoStart function**

Add this function after `injectStartButton`:

```js
function watchForAutoStart(videoId, minPct) {
  const video = document.querySelector('video');
  if (!video) {
    injectStartButton(videoId);
    return;
  }

  function onTimeUpdate() {
    if (sessionStarted || videoId !== lastVideoId) {
      video.removeEventListener('timeupdate', onTimeUpdate);
      return;
    }
    if (video.duration > 0 && video.currentTime / video.duration >= minPct / 100) {
      video.removeEventListener('timeupdate', onTimeUpdate);
      triggerSession(videoId);
    }
  }

  video.addEventListener('timeupdate', onTimeUpdate);
}
```

- [ ] **Step 3: Verify auto-start behaviour**

In the options page, enable auto-start with 0% minimum. Load a YouTube video. Confirm the side panel opens automatically without clicking the button. Then set auto-start back to off and confirm the button returns.

- [ ] **Step 4: Commit**

```bash
git add content/content.js
git commit -m "feat: auto-start trigger reads autoStart and minWatchPct from llmConfig"
```

---

## Task 12: Wire quiz difficulty into AI prompts (already in providers — verify end-to-end)

**Files:**
- No new code needed — difficulty is in `llmConfig` which the providers already read via `this.config.difficulty`

- [ ] **Step 1: Confirm the data path**

`getAIProvider()` in `ai/index.js` reads the full `llmConfig` and passes it to the provider constructor. All three providers (`AnthropicProvider`, `OpenAICompatibleProvider`, `GeminiProvider`) set `this.config = config` (via the `AIProvider` base class). In Task 5, each `generateQuiz` method reads `this.config.difficulty`. The options page in Task 9 saves `difficulty` into `llmConfig`. So the end-to-end path is complete without additional code.

- [ ] **Step 2: Verify difficulty affects the prompt**

Set difficulty to "Hard" in the options page. Trigger a session. In the background DevTools, temporarily add a `console.log(system)` inside `generateQuiz` to confirm the system prompt includes "application and edge-case questions". Remove the log after verifying.

- [ ] **Step 3: Final end-to-end smoke test**

1. Load the extension fresh (no cached session)
2. Open options page — confirm all settings save correctly
3. Navigate to a YouTube video with captions
4. Click "▶ Start LearnLoop" — confirm loading screen appears
5. Confirm summary screen renders
6. Click "Take the Quiz" — go through all 3 question types:
   - Multiple choice: select answer, submit, see feedback with potential timestamp link
   - Predict-output: type text in textarea, submit, confirm correct/wrong
   - Free-text: type answer, submit, AI evaluates
7. Pass the quiz → challenge screen
8. Confirm CodeMirror editor loads with starter code
9. Write a solution, Ctrl+Enter runs it, tests pass
10. Click a timestamp link in quiz feedback — confirm YouTube seeks to that time

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: complete LearnLoop — all bugs fixed, all features built"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec section | Task |
|---|---|
| Bug #5 sandbox guard | Task 1 |
| Bug #6 no-transcript tooltip | Task 1 |
| Dead ai/openai.js | Task 1 |
| SVG icons | Task 2 |
| Transcript → Segment[] | Task 3 |
| Background tabId + helpers + SEEK_VIDEO | Task 4 |
| Provider generateQuiz signature + timestamps | Task 5 |
| main.js renderExplanation + tabId + predict-output | Task 6 |
| CodeMirror download | Task 7 |
| CodeMirror integration | Task 8 |
| Options page | Task 9 |
| Popup redesign | Task 10 |
| Auto-start | Task 11 |
| Quiz difficulty | Task 12 (wired in Task 5, verified here) |

All spec requirements are covered. ✓
