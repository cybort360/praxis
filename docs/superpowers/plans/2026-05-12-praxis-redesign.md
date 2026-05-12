# Praxis Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the extension from LearnLoop to Praxis and add session history, transcript viewer, and AI chat.

**Architecture:** Two new script files (`history.js`, `chat.js`) expose globals consumed by the existing `main.js`. The chat drawer is `position:fixed` at the bottom of the viewport; CSS classes on `body` push screen content upward. History lives in `chrome.storage.local` under `praxisHistory`. The summary screen gains a tab bar (Summary | Transcript) handled by a small `initSummaryTabs()` helper in `main.js`.

**Tech Stack:** Chrome Extension MV3, vanilla JS (no bundler), chrome.storage.local, CSS transitions.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `manifest.json` | Modify | `"name"` field |
| `sidepanel/index.html` | Modify | Rename; add SVG symbol; add history screen; restructure summary with tabs; add chat drawer; add script tags |
| `sidepanel/style.css` | Modify | Add tab, transcript, history card, and chat drawer styles |
| `sidepanel/main.js` | Modify | Wire history nav, transcript render, chat lifecycle, session URL |
| `sidepanel/history.js` | **Create** | History module |
| `sidepanel/chat.js` | **Create** | Chat module |
| `ai/provider.js` | Modify | Add `chat()` abstract stub |
| `ai/gemini.js` | Modify | Add `chat()` implementation |
| `ai/openai-compatible.js` | Modify | Add `chat()` implementation |
| `background.js` | Modify | Add `CHAT_MESSAGE` handler |
| `options/index.html` | Modify | Rename title |
| `popup/index.html` | Modify | Rename title and header text |
| `README.md` | Modify | Rename all mentions |

---

## Task 1: Rename LearnLoop → Praxis

**Files:**
- Modify: `manifest.json`
- Modify: `sidepanel/index.html`
- Modify: `sidepanel/style.css`
- Modify: `sidepanel/main.js`
- Modify: `options/index.html`
- Modify: `popup/index.html`
- Modify: `README.md`

- [ ] **Step 1: Update `manifest.json`**

Change line 3:
```json
"name": "Praxis",
```

Also update description to match:
```json
"description": "Watch tutorials. Get quizzed. Build. Actually learn.",
```
(description is fine as-is — no change needed)

- [ ] **Step 2: Update `sidepanel/index.html`**

Change `<title>LearnLoop</title>` → `<title>Praxis</title>`

Change the app-bar brand span:
```html
<span>Praxis</span>
```

Change the welcome logo text:
```html
<p class="welcome-logo-text">Praxis</p>
```

Change the instruction text:
```html
Navigate to a tutorial on YouTube, Udemy, Coursera, or any supported platform and click the <strong>Start Praxis</strong> button on the page.
```

- [ ] **Step 3: Update `sidepanel/style.css`**

Change the comment on line 1:
```css
/* ═══ Praxis Design System v2 ═══ */
```

- [ ] **Step 4: Update `sidepanel/main.js`**

Change the two console.error references from `[LearnLoop]` to `[Praxis]`:

In `persistState()`:
```js
  }).catch(e => console.error('[Praxis] persistState failed:', e));
```

In `restoreOrInit()`:
```js
    console.error('[Praxis] restoreOrInit failed:', e);
```

- [ ] **Step 5: Update `options/index.html`**

Change `<title>LearnLoop Settings</title>` → `<title>Praxis Settings</title>`

- [ ] **Step 6: Update `popup/index.html`**

Change `<title>LearnLoop</title>` → `<title>Praxis</title>`

Change the logo text span:
```html
<span class="logo-text">Praxis</span>
```

- [ ] **Step 7: Update `README.md`**

Replace all occurrences of "LearnLoop" with "Praxis". Run:
```bash
sed -i '' 's/LearnLoop/Praxis/g' README.md
```

Verify:
```bash
grep -c "LearnLoop" README.md
```
Expected: `0`

- [ ] **Step 8: Verify no LearnLoop references remain in shipped files**

```bash
grep -r "LearnLoop" --include="*.js" --include="*.html" --include="*.json" --include="*.css" /Users/user/Desktop/learnloop \
  --exclude-dir=.git --exclude-dir=.superpowers --exclude-dir=docs
```
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add manifest.json sidepanel/index.html sidepanel/style.css sidepanel/main.js options/index.html popup/index.html README.md
git commit -m "feat: rename LearnLoop → Praxis across all files"
```

---

## Task 2: Add `chat()` to the AI provider layer

**Files:**
- Modify: `ai/provider.js`
- Modify: `ai/gemini.js`
- Modify: `ai/openai-compatible.js`
- Modify: `background.js`

- [ ] **Step 1: Add abstract `chat()` stub to `ai/provider.js`**

After the `evaluateAnswer()` stub (around line 79), add:

```js
  /**
   * Answer a user's question about the video using conversation history.
   * @param {{ role: 'user'|'assistant', content: string }[]} messages - Full conversation so far
   * @param {string} transcript - Plain-text transcript (first 6000 chars used)
   * @param {string} videoTitle
   * @returns {Promise<{ reply: string }>}
   */
  async chat(messages, transcript, videoTitle) {
    throw new Error('chat() must be implemented by the provider');
  }
```

- [ ] **Step 2: Add `chat()` to `ai/openai-compatible.js`**

After the `evaluateAnswer()` method (before the closing `}`), add:

```js
  async chat(messages, transcript, videoTitle) {
    const system = `You are a concise tutor helping a learner understand a video they just watched. Answer questions using only the content of the video transcript. If the answer is not in the transcript, say so. Keep answers to 2–3 sentences unless a longer explanation is clearly needed.\n\nVideo: "${videoTitle}"\n\nTranscript:\n${transcript.slice(0, 6000)}`;
    let res;
    try {
      res = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...this.extraHeaders,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'system', content: system }, ...messages],
          max_tokens: 512,
          temperature: 0.4,
        }),
      });
    } catch (networkErr) {
      throw new Error(`Network error reaching ${this.baseURL}: ${networkErr.message}`);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`API error ${res.status}: ${err?.error?.message || res.statusText}`);
    }
    const data = await res.json();
    return { reply: data.choices?.[0]?.message?.content ?? '' };
  }
```

- [ ] **Step 3: Add `chat()` to `ai/gemini.js`**

After the `evaluateAnswer()` method (before the closing `}`), add:

```js
  async chat(messages, transcript, videoTitle) {
    const systemText = `You are a concise tutor helping a learner understand a video they just watched. Answer questions using only the content of the video transcript. If the answer is not in the transcript, say so. Keep answers to 2–3 sentences unless a longer explanation is clearly needed.\n\nVideo: "${videoTitle}"\n\nTranscript:\n${transcript.slice(0, 6000)}`;
    // Gemini uses 'user'/'model' roles — map 'assistant' → 'model'
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const url = `${this.baseURL}/${this.model}:generateContent`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: { maxOutputTokens: 512, temperature: 0.4 },
        }),
      });
    } catch (networkErr) {
      throw new Error(`Network error reaching Gemini: ${networkErr.message}`);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Gemini API error ${res.status}: ${err?.error?.message || res.statusText}`);
    }
    const data = await res.json();
    return { reply: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '' };
  }
```

- [ ] **Step 4: Add `CHAT_MESSAGE` handler to `background.js`**

In the switch statement, immediately before `case 'FETCH_VTT':`, add:

```js
    case 'CHAT_MESSAGE': {
      const { messages, transcript, videoTitle } = message.payload;
      handleChat({ messages, transcript, videoTitle })
        .then(result => sendResponse({ ok: true, data: result }))
        .catch(err  => sendResponse({ ok: false, error: err.message }));
      return true;
    }
```

Then, after the `handleEvaluateAnswer` function at the bottom of the file, add:

```js
async function handleChat({ messages, transcript, videoTitle }) {
  const ai = await getAIProvider();
  return ai.chat(messages, transcript, videoTitle);
}
```

- [ ] **Step 5: Verify syntax**

```bash
node --input-type=module < background.js 2>&1 | head -5
```
Expected: `ReferenceError: chrome is not defined` (Chrome API error, not syntax error). Any other error = syntax mistake.

- [ ] **Step 6: Commit**

```bash
git add ai/provider.js ai/gemini.js ai/openai-compatible.js background.js
git commit -m "feat: add chat() AI method and CHAT_MESSAGE background handler"
```

---

## Task 3: Create `sidepanel/history.js`

**Files:**
- Create: `sidepanel/history.js`

- [ ] **Step 1: Create the file**

Create `sidepanel/history.js` with this exact content:

```js
// sidepanel/history.js — Session history module
// Exposes the History global. Loaded before main.js in index.html.

const History = (() => {
  const KEY = 'praxisHistory';
  const MAX = 50;

  function inferPlatform(url) {
    try {
      const host = new URL(url).hostname;
      if (host.includes('youtube.com'))    return 'YouTube';
      if (host.includes('udemy.com'))      return 'Udemy';
      if (host.includes('coursera.org'))   return 'Coursera';
      if (host.includes('linkedin.com'))   return 'LinkedIn Learning';
      if (host.includes('khanacademy.org')) return 'Khan Academy';
      if (host.includes('pluralsight.com')) return 'Pluralsight';
      return host.replace(/^www\./, '');
    } catch (_) {
      return 'Unknown';
    }
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 2)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7)   return `${days} days ago`;
    return new Date(ts).toLocaleDateString();
  }

  async function saveSession(data) {
    try {
      const stored = await chrome.storage.local.get(KEY);
      const list   = stored[KEY] || [];
      list.unshift({
        id:             String(Date.now()),
        videoTitle:     data.videoTitle || 'Untitled',
        platform:       inferPlatform(data.url || ''),
        url:            data.url || '',
        date:           Date.now(),
        quizScore:      null,
        quizTotal:      null,
        challengePassed: null,
        summary:        data.summary?.summary   || '',
        keyPoints:      data.summary?.keyPoints || [],
      });
      if (list.length > MAX) list.length = MAX;
      await chrome.storage.local.set({ [KEY]: list });
      // Reveal the history toolbar icon now that there is at least one entry
      document.getElementById('btn-history').classList.remove('hidden');
    } catch (e) {
      console.error('[Praxis] History.saveSession failed:', e);
    }
  }

  async function loadHistory() {
    const stored = await chrome.storage.local.get(KEY);
    return stored[KEY] || [];
  }

  async function renderHistory() {
    const list      = await loadHistory();
    const container = document.getElementById('history-list');
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML =
        '<p class="history-empty">No sessions yet — complete a video to see your history here.</p>';
      return;
    }

    list.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const body = document.createElement('div');
      body.className = 'history-card-body';
      body.innerHTML = `
        <p class="history-title">${entry.videoTitle}</p>
        <p class="history-meta">${entry.platform} · ${timeAgo(entry.date)}</p>
      `;

      const expand = document.createElement('div');
      expand.className = 'history-expand hidden';
      expand.innerHTML = `
        <p class="history-summary-text">${entry.summary || '—'}</p>
        <ul class="history-key-points">
          ${(entry.keyPoints || []).map(p => `<li>${p}</li>`).join('')}
        </ul>
      `;

      body.addEventListener('click', () => {
        expand.classList.toggle('hidden');
        card.classList.toggle('expanded');
      });

      card.appendChild(body);
      card.appendChild(expand);
      container.appendChild(card);
    });
  }

  async function clearHistory() {
    await chrome.storage.local.remove(KEY);
    document.getElementById('history-list').innerHTML =
      '<p class="history-empty">No sessions yet — complete a video to see your history here.</p>';
    document.getElementById('btn-history').classList.add('hidden');
  }

  return { saveSession, loadHistory, renderHistory, clearHistory };
})();
```

- [ ] **Step 2: Commit**

```bash
git add sidepanel/history.js
git commit -m "feat: add history.js session history module"
```

---

## Task 4: Create `sidepanel/chat.js`

**Files:**
- Create: `sidepanel/chat.js`

- [ ] **Step 1: Create the file**

Create `sidepanel/chat.js` with this exact content:

```js
// sidepanel/chat.js — AI chat module
// Exposes the Chat global. Loaded before main.js in index.html.
// Requires DOM elements: #chat-drawer, #chat-messages, #chat-input, #chat-send

const Chat = (() => {
  let _transcript  = '';
  let _videoTitle  = '';
  let _messages    = [];
  let _isOpen      = false;
  let _isLoading   = false;

  // ── Public API ────────────────────────────────────────────────────────────

  function init(transcript, videoTitle) {
    _transcript = Array.isArray(transcript)
      ? transcript.map(s => s.text).join(' ')
      : (transcript || '');
    _videoTitle  = videoTitle || '';
    _messages    = [];
    _isOpen      = false;
    _isLoading   = false;

    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-drawer').style.display = 'flex';
    document.body.classList.add('chat-visible');
    _setOpen(false);
  }

  function reset() {
    _transcript = '';
    _videoTitle = '';
    _messages   = [];
    _isOpen     = false;
    _isLoading  = false;

    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-drawer').style.display = 'none';
    document.body.classList.remove('chat-visible', 'chat-open');
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _setOpen(open) {
    _isOpen = open;
    document.getElementById('chat-drawer').classList.toggle('open', open);
    document.body.classList.toggle('chat-open', open);
  }

  function _appendBubble(role, text) {
    const msgList = document.getElementById('chat-messages');
    const div     = document.createElement('div');
    div.className = `chat-bubble chat-bubble-${role}`;
    div.textContent = text;
    msgList.appendChild(div);
    msgList.scrollTop = msgList.scrollHeight;
    return div;
  }

  function _appendTypingIndicator() {
    const msgList = document.getElementById('chat-messages');
    const div     = document.createElement('div');
    div.className = 'chat-bubble chat-bubble-assistant chat-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    msgList.appendChild(div);
    msgList.scrollTop = msgList.scrollHeight;
    return div;
  }

  async function _send() {
    if (_isLoading || !_transcript) return;
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;

    input.value = '';
    _messages.push({ role: 'user', content: text });
    _appendBubble('user', text);

    if (!_isOpen) _setOpen(true);

    _isLoading    = true;
    input.disabled = true;
    const typingEl = _appendTypingIndicator();

    const resp = await chrome.runtime.sendMessage({
      type:    'CHAT_MESSAGE',
      payload: { messages: _messages, transcript: _transcript, videoTitle: _videoTitle },
    });

    typingEl.remove();
    _isLoading     = false;
    input.disabled = false;
    input.focus();

    if (resp?.ok) {
      const reply = resp.data.reply;
      _messages.push({ role: 'assistant', content: reply });
      _appendBubble('assistant', reply);
    } else {
      _appendBubble('assistant', 'Something went wrong — try again.');
    }
  }

  // ── DOM event wiring (runs once at script load, DOM is ready) ─────────────

  document.getElementById('chat-input').addEventListener('focus', () => {
    if (!_isOpen && _transcript) _setOpen(true);
  });

  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
  });

  document.getElementById('chat-send').addEventListener('click', () => _send());

  // Collapse when clicking outside the drawer
  document.addEventListener('click', e => {
    const drawer = document.getElementById('chat-drawer');
    if (_isOpen && !drawer.contains(e.target)) _setOpen(false);
  });

  // Collapse on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _isOpen) _setOpen(false);
  });

  return { init, reset };
})();
```

- [ ] **Step 2: Commit**

```bash
git add sidepanel/chat.js
git commit -m "feat: add chat.js AI chat module with bottom drawer"
```

---

## Task 5: Update `sidepanel/index.html` — history screen, summary tabs, chat drawer, script tags

**Files:**
- Modify: `sidepanel/index.html`

- [ ] **Step 1: Add `ic-history` SVG symbol to the sprite**

In the `<defs>` block, immediately before the closing `</defs>`, add:

```html
    <symbol id="ic-history" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </symbol>
```

- [ ] **Step 2: Add `btn-history` to the app bar**

Replace the `<div class="app-bar-actions">` block with:

```html
  <div class="app-bar-actions">
    <button id="btn-history" class="icon-btn hidden" title="Session history">
      <svg class="icon icon-sm"><use href="#ic-history"/></svg>
    </button>
    <button id="btn-reset" class="icon-btn hidden" title="Reset session">
      <svg class="icon icon-sm"><use href="#ic-refresh"/></svg>
    </button>
    <button id="btn-theme" class="icon-btn" title="Toggle theme">
      <svg class="icon icon-sm" id="theme-icon"><use href="#ic-sun"/></svg>
    </button>
  </div>
```

- [ ] **Step 3: Add `screen-history` before the sandbox iframe**

Insert this block immediately before `<!-- Sandbox iframe -->`:

```html
<!-- SCREEN: History -->
<div id="screen-history" class="screen">
  <div class="screen-header">
    <div class="step-header-row">
      <span class="step-badge">
        <svg class="icon icon-xs" aria-hidden="true"><use href="#ic-history"/></svg>
        History
      </span>
      <button id="btn-back-history" class="btn btn-ghost btn-sm">
        <svg class="icon icon-xs" aria-hidden="true"><use href="#ic-chevron-left"/></svg>
        Back
      </button>
    </div>
    <h2>Session History</h2>
  </div>
  <div id="history-list"></div>
  <button id="btn-clear-history" class="btn btn-ghost btn-sm" style="margin-top:16px;width:100%;color:var(--error);">
    Clear history
  </button>
</div>
```

- [ ] **Step 4: Restructure `screen-summary` with tabs**

Replace the entire `<!-- SCREEN: Summary -->` block with:

```html
<!-- SCREEN: Summary -->
<div id="screen-summary" class="screen">
  <div class="screen-header">
    <span class="step-badge">
      <svg class="icon icon-xs" aria-hidden="true"><use href="#ic-book"/></svg>
      Step 1 of 3
    </span>
    <h2 id="summary-title"></h2>
  </div>

  <div class="tab-bar">
    <button class="tab-btn active" data-tab="summary">Summary</button>
    <button class="tab-btn" data-tab="transcript">Transcript</button>
  </div>

  <div class="tab-panel active" data-tab="summary">
    <p id="summary-text"></p>
    <ul id="summary-points"></ul>
    <button id="btn-start-quiz" class="btn btn-primary btn-full">
      Take the Quiz
      <svg class="icon icon-sm" aria-hidden="true"><use href="#ic-arrow-right"/></svg>
    </button>
  </div>

  <div class="tab-panel" data-tab="transcript">
    <div id="transcript-list" class="transcript-list"></div>
  </div>
</div>
```

- [ ] **Step 5: Add the chat drawer before the sandbox iframe**

Insert this block immediately before `<!-- Sandbox iframe -->`:

```html
<!-- Chat drawer -->
<div id="chat-drawer" style="display:none;">
  <div id="chat-messages" class="chat-messages"></div>
  <div class="chat-input-row">
    <input type="text" id="chat-input" placeholder="Ask about this video…" autocomplete="off" />
    <button id="chat-send" class="chat-send-btn" title="Send">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    </button>
  </div>
</div>
```

- [ ] **Step 6: Add script tags for history.js and chat.js**

Replace the existing script block at the bottom:

```html
<script src="vendor/codemirror.min.js"></script>
<script src="vendor/mode-simple.min.js"></script>
<script src="vendor/javascript.min.js"></script>
<script src="vendor/rust.min.js"></script>
<script src="vendor/python.min.js"></script>
<script src="vendor/clike.min.js"></script>
<script src="vendor/go.min.js"></script>
<script src="vendor/shell.min.js"></script>
<script src="history.js"></script>
<script src="chat.js"></script>
<script src="main.js"></script>
```

- [ ] **Step 7: Verify HTML is well-formed**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('sidepanel/index.html','utf8');
const opens  = (html.match(/<div/g) || []).length;
const closes = (html.match(/<\/div>/g) || []).length;
console.log('div opens:', opens, 'closes:', closes, opens === closes ? '✓' : '✗ MISMATCH');
"
```
Expected: `div opens: N closes: N ✓`

- [ ] **Step 8: Commit**

```bash
git add sidepanel/index.html
git commit -m "feat: add history screen, summary tabs, and chat drawer to sidepanel HTML"
```

---

## Task 6: Add CSS for tabs, transcript, history cards, and chat drawer

**Files:**
- Modify: `sidepanel/style.css`

- [ ] **Step 1: Append styles at the end of `sidepanel/style.css`**

Add this entire block at the very end of the file:

```css
/* ── Summary tabs ─────────────────────────────────────────────────────────── */
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  gap: 0;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  margin-bottom: -1px;
  transition: color var(--t), border-color var(--t);
  font-family: inherit;
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.tab-btn:hover:not(.active) { color: var(--text-2); }

.tab-panel { display: none; flex-direction: column; gap: 14px; }
.tab-panel.active { display: flex; }

/* ── Transcript viewer ────────────────────────────────────────────────────── */
.transcript-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
}

.transcript-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 7px 6px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  border-radius: var(--r-sm);
  width: 100%;
  transition: background var(--t);
  font-family: inherit;
}

.transcript-row:hover { background: var(--surface); }

.transcript-ts {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  flex-shrink: 0;
  min-width: 38px;
}

.transcript-text {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.5;
  text-align: left;
}

@keyframes ts-highlight {
  0%   { background: var(--accent-surface-2); }
  100% { background: transparent; }
}
.transcript-row.highlight { animation: ts-highlight 0.7s ease-out forwards; }

/* ── History screen ───────────────────────────────────────────────────────── */
.history-card {
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  background: var(--surface);
  transition: border-color var(--t);
}

.history-card + .history-card { margin-top: 8px; }

.history-card.expanded { border-color: var(--border-2); }

.history-card-body {
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: background var(--t);
}

.history-card-body:hover { background: var(--surface-2); }

.history-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.history-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.history-expand {
  padding: 10px 14px 14px;
  border-top: 1px solid var(--border);
}

.history-expand.hidden { display: none; }

.history-summary-text {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.6;
  margin-bottom: 8px;
}

.history-key-points {
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-key-points li {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
}

.history-empty {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  padding: 40px 20px;
}

/* ── Chat drawer ──────────────────────────────────────────────────────────── */
#chat-drawer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 150;
  flex-direction: column;
  background: var(--surface);
  border-top: 1px solid var(--border);
  height: 52px;
  overflow: hidden;
  transition: height 0.22s ease;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.2);
}

#chat-drawer.open { height: 45vh; }

/* Push screen content above the drawer so it's never hidden behind it */
body.chat-visible .screen  { padding-bottom: 66px; }
body.chat-open    .screen  { padding-bottom: calc(45vh + 14px); }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 12px 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  height: 52px;
}

#chat-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 7px 12px;
  font-size: 13px;
  color: var(--text);
  font-family: inherit;
  outline: none;
  transition: border-color var(--t);
}

#chat-input:focus { border-color: var(--accent); }
#chat-input::placeholder { color: var(--text-muted); }
#chat-input:disabled { opacity: 0.5; }

.chat-send-btn {
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  background: var(--accent);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity var(--t);
}

.chat-send-btn:hover { opacity: 0.85; }

.chat-bubble {
  max-width: 86%;
  padding: 8px 12px;
  border-radius: var(--r);
  font-size: 13px;
  line-height: 1.55;
  word-wrap: break-word;
}

.chat-bubble-user {
  align-self: flex-end;
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-bubble-assistant {
  align-self: flex-start;
  background: var(--surface-2);
  color: var(--text);
  border-bottom-left-radius: 4px;
}

/* Typing indicator dots */
.chat-typing {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 12px 14px;
}

.chat-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typing-bounce 1.2s infinite;
}

.chat-typing span:nth-child(2) { animation-delay: 0.2s; }
.chat-typing span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30%            { transform: translateY(-5px); }
}
```

- [ ] **Step 2: Commit**

```bash
git add sidepanel/style.css
git commit -m "feat: add tabs, transcript, history, and chat drawer CSS"
```

---

## Task 7: Wire history, transcript viewer, and chat into `main.js`

**Files:**
- Modify: `sidepanel/main.js`

- [ ] **Step 1: Add `videoUrl` to state and `previousScreen` variable**

After the `let sandboxWindow = null;` line, add:

```js
let previousScreen = 'screen-idle';
```

In the `state` object, add `videoUrl: null,`:

```js
const state = {
  transcript: null,
  videoTitle: null,
  videoUrl:   null,
  tabId:      null,
  summary:    null,
  quiz:       [],
  challenge:  null,
  quizIndex:  0,
  quizPassed: 0,
  hintIndex:  0,
  selectedOption: null,
};
```

- [ ] **Step 2: Capture `videoUrl` in `restoreOrInit()`**

In the `if (pendingSession)` block, add `state.videoUrl = pendingSession.videoId;`:

```js
    if (pendingSession) {
      chrome.storage.session.remove(['pendingSession', 'savedSession']);
      state.videoTitle = pendingSession.title;
      state.videoUrl   = pendingSession.videoId;
      state.transcript = pendingSession.transcript;
      state.tabId      = pendingSession.tabId;
      startSession();
      return;
    }
```

- [ ] **Step 3: Clear `videoUrl` in `resetState()`**

In `resetState()`, add `state.videoUrl = null;` and `Chat.reset();`:

```js
function resetState() {
  state.transcript    = null;
  state.videoTitle    = null;
  state.videoUrl      = null;
  state.tabId         = null;
  state.summary       = null;
  state.quiz          = [];
  state.challenge     = null;
  state.quizIndex     = 0;
  state.quizPassed    = 0;
  state.hintIndex     = 0;
  state.selectedOption = null;
  Chat.reset();
  chrome.storage.session.remove(['savedSession', 'pendingSession']);
}
```

- [ ] **Step 4: Update `showScreen()` to hide reset on history screen**

Replace the `showScreen` function with:

```js
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  const hideReset = id === 'screen-idle' || id === 'screen-loading' || id === 'screen-history';
  document.getElementById('btn-reset').classList.toggle('hidden', hideReset);
}
```

- [ ] **Step 5: Save history in `startSession()` after state is set**

In `startSession()`, after `state.hintIndex = 0;` and before `persistState('summary');`, add:

```js
  History.saveSession({ videoTitle: state.videoTitle, url: state.videoUrl, summary });
```

The block should look like:

```js
  state.summary  = summary;
  state.quiz     = quiz;
  state.challenge = challenge;
  state.quizIndex = 0;
  state.quizPassed = 0;
  state.hintIndex  = 0;

  History.saveSession({ videoTitle: state.videoTitle, url: state.videoUrl, summary });

  persistState('summary');
  renderSummary();
  showScreen('screen-summary');
```

- [ ] **Step 6: Update `renderSummary()` to reset tabs and init chat**

Replace the entire `renderSummary()` function with:

```js
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
```

- [ ] **Step 7: Add `renderTranscript()` function**

Add this function immediately after `renderSummary()`:

```js
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
    btn.innerHTML = `<span class="transcript-ts">${m}:${s}</span><span class="transcript-text">${seg.text}</span>`;
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SEEK_VIDEO', payload: { t, tabId: state.tabId } });
      btn.classList.add('highlight');
      setTimeout(() => btn.classList.remove('highlight'), 700);
    });
    list.appendChild(btn);
  });
}
```

- [ ] **Step 8: Add `initSummaryTabs()` function**

Add this function immediately after `renderTranscript()`:

```js
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
```

- [ ] **Step 9: Add history navigation event listeners**

Add these three event listeners anywhere after the existing button listeners (before the `// ── Init ──` comment at the bottom):

```js
document.getElementById('btn-history').addEventListener('click', () => {
  previousScreen = document.querySelector('.screen.active')?.id || 'screen-idle';
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
```

- [ ] **Step 10: Update the `// ── Init ──` section at the bottom**

Replace the existing `restoreOrInit();` line at the bottom with:

```js
// ── Init ──
initSummaryTabs();

// Show history icon if past sessions exist
History.loadHistory().then(list => {
  if (list.length > 0) document.getElementById('btn-history').classList.remove('hidden');
});

restoreOrInit();
```

- [ ] **Step 11: Verify syntax**

```bash
node --input-type=module < sidepanel/main.js 2>&1 | head -5
```
Expected: `ReferenceError: localStorage is not defined` (browser API, not a syntax error). Any other error = syntax mistake.

- [ ] **Step 12: Commit**

```bash
git add sidepanel/main.js
git commit -m "feat: wire history nav, transcript viewer, and chat into main.js"
```

---

## Task 8: Manual verification

No automated test runner is available for Chrome extensions. Reload the extension at `chrome://extensions` (find Praxis, click the reload ↺ button) before each test.

- [ ] **Step 1: Verify rename**

Open the extension popup. Expected: title bar shows "Praxis", header shows "Praxis".
Open the sidepanel. Expected: app bar shows "Praxis", idle screen says "Praxis".
Open options (`chrome://extensions` → Praxis → Details → Extension options). Expected: page title "Praxis Settings".

- [ ] **Step 2: Verify session history saves and renders**

Navigate to any YouTube tutorial, click "Start Praxis", wait for the summary screen.
Click the clock icon in the toolbar. Expected:
- History screen opens showing the video title
- Platform shows "YouTube"
- Time shows "Just now"
- Clicking the card expands summary text + key points

Click Back. Expected: returns to summary screen.

- [ ] **Step 3: Verify history icon appears after first session**

Before any session: history icon should be hidden on the idle screen.
After completing a session (summary loads): history icon appears.
Reload the extension and navigate to idle screen — history icon should still be visible (loaded from storage).

- [ ] **Step 4: Verify Clear history**

In the history screen, click "Clear history" → confirm.
Expected: list shows "No sessions yet…" message. History icon hides.

- [ ] **Step 5: Verify transcript tab**

On the summary screen, click "Transcript" tab.
Expected: scrollable list of transcript segments with timestamps on the left.
Click a timestamp row. Expected: video seeks to that position and the row briefly highlights.
Click "Summary" tab. Expected: returns to summary content.

- [ ] **Step 6: Verify AI chat drawer**

On any screen after summary loads, the chat bar should be visible at the bottom.
Click the input. Expected: drawer expands to ~45% height showing empty message list.
Type a question about the video and press Enter. Expected:
- User bubble appears immediately
- Typing indicator (3 dots) appears
- After a few seconds, AI reply bubble appears
Press Escape. Expected: drawer collapses but the conversation remains.
Click the input again. Expected: drawer re-expands with conversation intact.

- [ ] **Step 7: Verify chat resets on new session**

Click the reset button (↺). Navigate to a new video and start a new session.
Expected: chat input is clear, no previous conversation visible.

- [ ] **Step 8: Final commit if any minor fixes were made**

```bash
git add -p   # stage only intentional changes
git commit -m "fix: corrections from manual verification"
```

---

## Self-Review

**Spec coverage:**
- ✅ Rename: all files updated in Task 1
- ✅ History storage (praxisHistory, 50 entries, newest first): `history.js` `saveSession()`
- ✅ Platform inference from URL: `inferPlatform()` in `history.js`
- ✅ History toolbar icon (hidden until first session): `btn-history` + `History.loadHistory()` check in init
- ✅ History screen with back button: `screen-history` HTML, `btn-back-history` listener, `previousScreen` tracking
- ✅ History cards with expand/collapse: `renderHistory()` in `history.js`
- ✅ Clear history button: `btn-clear-history` listener + `History.clearHistory()`
- ✅ Summary tabs (Summary | Transcript): `tab-bar` HTML, `initSummaryTabs()`, tab CSS
- ✅ Transcript list with timestamps, clickable, highlight on seek: `renderTranscript()` in `main.js`
- ✅ Chat drawer fixed at bottom, 52px collapsed / 45vh expanded: CSS on `#chat-drawer`
- ✅ Chat expand on input focus, collapse on outside click / Escape: `chat.js` event wiring
- ✅ Typing indicator: `.chat-typing` CSS + `_appendTypingIndicator()` in `chat.js`
- ✅ Error bubble on chat failure: `chat.js` `_send()` error path
- ✅ Chat reset on session reset: `Chat.reset()` called from `resetState()`
- ✅ `chat()` method in both AI providers with Gemini role mapping: Task 2
- ✅ `CHAT_MESSAGE` background handler: Task 2
- ✅ History saved on `startSession()` only (not on restore — avoids duplicates): Task 7 Step 5
- ✅ `body.chat-visible` / `body.chat-open` classes push screen content above drawer: CSS

**Placeholder scan:** No TBDs found.

**Type consistency:**
- `History.saveSession(data)` called with `{ videoTitle, url, summary }` — matches `history.js` destructuring ✓
- `Chat.init(state.transcript, state.videoTitle)` — matches `chat.js` `init(transcript, videoTitle)` ✓
- `Chat.reset()` — matches `chat.js` ✓
- `initSummaryTabs()` called once at init and `renderSummary()` resets tab state manually — no double-listener issue ✓
