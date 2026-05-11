# LearnLoop — Project Spec
**Handoff document for Claude Code**
Last updated: 2026-05-11

---

## What exists right now

A working Chrome extension (Manifest V3) skeleton with the following already built:

- `manifest.json` — permissions, side panel, content script, service worker declared
- `background.js` — service worker with message router; all AI calls go through here
- `ai/provider.js` — abstract base class defining the contract all providers must implement
- `ai/anthropic.js` — Anthropic (Claude) provider, all 4 methods implemented
- `ai/openai.js` — OpenAI (GPT) provider, all 4 methods implemented
- `ai/index.js` — factory that reads `llmConfig` from `chrome.storage.local` and returns the right provider
- `content/content.js` — injected into YouTube, extracts transcript via YouTube's caption track API, fires `VIDEO_DETECTED` message
- `sidepanel/index.html` + `style.css` + `main.js` — full 3-screen learning loop (Summary → Quiz → Challenge + JS sandbox)
- `popup/index.html` + `popup.js` — settings UI to save provider + API key to `chrome.storage.local`
- `icons/` — placeholder purple square PNGs (16, 48, 128)

The architecture is deliberately set up so adding a new AI provider only requires: creating one file, implementing 4 methods, adding one `case` to `ai/index.js`, and one `<option>` in the popup.

---

## Known bugs to fix before the extension is usable

### 1. Race condition: side panel not ready when transcript arrives
**File:** `background.js` lines 18–24

`chrome.sidePanel.open()` is async but we immediately call `chrome.runtime.sendMessage({ type: 'TRANSCRIPT_READY' })` without waiting. The side panel's message listener in `main.js` won't be attached yet, so the transcript message is lost.

**Fix:** Use `chrome.tabs.sendMessage` with a retry/polling approach, or store the payload in `chrome.storage.session` and have the side panel pull it on load rather than waiting for a push.

Recommended approach:
```js
// background.js — after opening the side panel, store payload and let the panel pull it
await chrome.storage.session.set({ pendingSession: message.payload });
await chrome.sidePanel.open({ tabId: sender.tab.id });
// side panel polls chrome.storage.session on DOMContentLoaded
```

### 2. Missing element ID: `quiz-question-wrap`
**File:** `sidepanel/main.js` line 198, `sidepanel/index.html`

`main.js` calls `document.getElementById('quiz-question-wrap').classList.add('hidden')` when the quiz completes, but no element with that ID exists in the HTML. The quiz completion screen will throw a null reference error and never show.

**Fix:** Add `id="quiz-question-wrap"` to the `<div id="quiz-question-wrap">` wrapper in `sidepanel/index.html` that wraps the question, options, freetext, feedback, and submit/next buttons.

### 3. No quiz pass gate — users can fail everything and still proceed
**File:** `sidepanel/main.js` — `btn-quiz-next` click handler

The quiz tracks `state.quizPassed` but never checks it. A user can answer every question wrong and still reach the challenge. This defeats the entire purpose of the quiz gate.

**Fix:** On quiz completion, check pass rate. Require at least 2/3 correct to proceed. If they fail, show a "Review and Retry" screen that links back to the specific timestamps in the video (or just resets the quiz with different question ordering).

```js
if (state.quizPassed < Math.ceil(state.quiz.length * 0.67)) {
  // show retry screen, not the challenge button
}
```

### 4. `content.js` transcript fetch may fail due to YouTube CSP
**File:** `content/content.js` lines 73–80

Fetching `https://www.youtube.com/watch?v=...` from inside a content script with `fetch()` works, but parsing `ytInitialPlayerResponse` from the raw HTML with a regex is brittle. YouTube changes this structure regularly.

**More reliable approach:** YouTube exposes `window.ytInitialPlayerResponse` directly in the page's JS context. Access it via an injected script rather than re-fetching the page:

```js
// Inject a tiny script to grab the already-parsed object
const script = document.createElement('script');
script.textContent = `
  window.postMessage({ type: '__LL_PLAYER_DATA', data: window.ytInitialPlayerResponse }, '*');
`;
document.documentElement.appendChild(script);
script.remove();

window.addEventListener('message', (e) => {
  if (e.data?.type === '__LL_PLAYER_DATA') { /* use e.data.data */ }
}, { once: true });
```

This avoids the extra network request and the brittle regex entirely.

### 5. Sandbox `postMessage` uses `'*'` as target origin
**File:** `sidepanel/main.js` line 275

`window.parent.postMessage({ type: 'RUN_RESULT', ... }, '*')` — posting to `'*'` from a sandboxed iframe is fine for security since the iframe is sandboxed, but receiving on `window` in the side panel with no origin check is sloppy.

**Fix:** Add an origin guard on the listener:
```js
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'RUN_RESULT') return;
  if (event.source !== document.getElementById('sandbox').contentWindow) return;
  // ...
});
```

### 6. No "no transcript" UI
**File:** `content/content.js` line 84

If the video has no captions, the function silently returns with a `console.log`. The user gets no feedback — the side panel never opens and they don't know why.

**Fix:** Send a `VIDEO_NO_TRANSCRIPT` message to background, which opens the side panel and renders an error state explaining captions are required.

### 7. ES module `import` in background service worker
**File:** `background.js` line 4

`import { getAIProvider } from './ai/index.js'` — Manifest V3 service workers support ES modules only if `"type": "module"` is set in the manifest's `background` declaration. This is already set correctly. However, all files imported from the service worker (`ai/index.js`, `ai/anthropic.js`, `ai/openai.js`, `ai/provider.js`) must also use `export`/`import` syntax consistently with no CommonJS `require()`. Currently this is correct but worth verifying if any dependency is added later.

---

## Features not yet built

### Must-have for MVP

**A. Manual "Start Session" trigger button**
The extension auto-fires on every YouTube video, including videos the user is just browsing past. There should be a button in the side panel (or a popup action) to manually kick off the session. Auto-trigger should be opt-in or triggered only after the user has watched a meaningful portion (e.g., >30% of the video).

Suggested: watch for `video.currentTime / video.duration > 0.3` in content.js before firing, or add a floating "Start LearnLoop" button injected onto the YouTube page.

**B. Session persistence across side panel close/reopen**
Currently all state lives in `main.js` memory. If the side panel is closed and reopened, everything resets. The session data (summary, quiz, challenge, quiz progress) should be saved to `chrome.storage.session` so a user can close and reopen the panel without losing their place.

**C. Error state screen in the side panel**
There is no error UI. If the AI call fails (bad API key, network error, rate limit), the current code calls `alert()` which is jarring and breaks the UX. Build a dedicated error screen with the error message and a "Try Again" button.

**D. Keyboard shortcut: Ctrl+Enter to run code**
The IDE has a Run button but no keyboard shortcut. Developers expect Ctrl+Enter (or Cmd+Enter on Mac) to run. Add a `keydown` listener on the `ide-editor` textarea.

**E. "Reset / New Session" button**
Once a session is complete, there's no way to go back to idle or restart with the same video. Add a reset button in the side panel header that clears state and returns to idle.

**F. Back navigation between screens**
Users can't go back from the quiz to review the summary, or from the challenge back to the quiz. Add a back button (or breadcrumb nav) in the screen headers.

### Nice-to-have (post-MVP)

**G. Syntax highlighting in the IDE**
The current IDE is a plain `<textarea>`. Integrate CodeMirror 6 (it's ~50kb and works without a bundler via CDN) to get syntax highlighting, bracket matching, and auto-indent. This makes the challenge feel like a real tool rather than a text box.

**H. "Predict the output" interactive mode**
For `predict-output` quiz questions, instead of showing options A/B/C/D, show the code snippet and a text input where the user types the exact output they expect. This is harder and better for deep logic.

**I. Video timestamp linkback in quiz explanations**
When the AI generates a quiz explanation, it should reference the video timestamp where the concept was explained (e.g., "This was covered at 4:32 in the video"). The side panel should render this as a clickable link that seeks the YouTube player to that timestamp. The content script can handle seeking via `document.querySelector('video').currentTime = seconds`.

**J. Gemini provider**
The `ai/index.js` factory has a commented placeholder for Gemini. Build `ai/gemini.js` following the same pattern as `ai/anthropic.js`. Gemini 1.5 Flash is extremely cheap and fast — good third option for users.

**K. Proper icons**
The current icons are solid purple squares generated by script. Replace with proper branded icons (16×16, 48×48, 128×128 PNGs). The logo concept is a play button with a loop arrow.

**L. Extension options page**
The popup is tiny. For settings beyond API key (e.g., choosing quiz difficulty, toggling auto-start, setting minimum watch percentage before triggering), build a full `options.html` page accessible via `chrome.runtime.openOptionsPage()`.

---

## Architecture decisions to preserve

These are intentional design choices — don't change them without reason:

1. **AI calls only happen in `background.js`** — the API key must never be accessible from content scripts or the side panel's JS context. The message-passing pattern (`GENERATE_SESSION`, `EVALUATE_ANSWER`) is the correct abstraction.

2. **The sandbox iframe is the code execution environment** — do not use `eval()` directly in the side panel. The sandboxed iframe with `sandbox="allow-scripts"` is safer. Keep this pattern even if you add more languages later.

3. **Provider abstraction lives in `ai/`** — all provider-specific logic stays in its own file. The `AIProvider` base class in `provider.js` defines the contract. Do not add provider-specific branching in `background.js`.

4. **`chrome.storage.local` for config, `chrome.storage.session` for runtime state** — config (API key, provider) persists across browser restarts. Session data (transcript, quiz state) should use `storage.session` so it clears when the browser closes.

---

## Suggested build order for Claude Code

1. Fix bug #2 (`quiz-question-wrap` ID) — 5 minutes, unblocks testing the quiz flow
2. Fix bug #1 (race condition) — switch to `chrome.storage.session` pull pattern
3. Fix bug #4 (transcript extraction) — use `window.ytInitialPlayerResponse` injection
4. Add feature A (manual start trigger / watch percentage gate)
5. Add feature C (error state screen)
6. Add feature B (session persistence)
7. Add feature D (Ctrl+Enter to run)
8. Add feature E+F (reset + back navigation)
9. Fix bug #3 (quiz pass gate)
10. Add feature G (CodeMirror syntax highlighting)
11. Add feature J (Gemini provider)
12. Add feature I (timestamp linkback)

---

## File map

```
learnloop/
├── manifest.json              ✅ complete
├── background.js              ⚠️  race condition bug (bug #1)
├── ai/
│   ├── provider.js            ✅ complete
│   ├── anthropic.js           ✅ complete
│   ├── openai.js              ✅ complete
│   └── index.js               ✅ complete (add Gemini case later)
├── content/
│   └── content.js             ⚠️  brittle transcript extraction (bug #4), no "no transcript" UI (bug #6)
├── sidepanel/
│   ├── index.html             ⚠️  missing quiz-question-wrap ID (bug #2)
│   ├── style.css              ✅ complete
│   └── main.js                ⚠️  no pass gate (bug #3), no error screen, no keyboard shortcut, no persistence
├── popup/
│   ├── index.html             ✅ complete
│   └── popup.js               ✅ complete
└── icons/                     ⚠️  placeholder only, needs real design
```

Legend: ✅ solid foundation, works as intended | ⚠️ needs work before shipping
