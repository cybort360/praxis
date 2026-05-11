# LearnLoop — Fix All & Build All Design Spec
**Date:** 2026-05-11

---

## Scope

This spec covers every outstanding bug fix and unbuilt feature from `projectspec.md`, based on the audit conducted 2026-05-11. Items are grouped by area.

---

## 1. Bug Fixes

### 1a. Sandbox message origin guard (Bug #5)

**File:** `sidepanel/main.js`

The `window.addEventListener('message', ...)` handler for `RUN_RESULT` events does not verify the source. Fix: add `if (event.source !== document.getElementById('sandbox').contentWindow) return;` before processing.

### 1b. No-transcript user feedback (Bug #6)

**File:** `content/content.js`

When `fetchTranscript` throws, the button disappears but the user gets no feedback. Fix: on transcript fetch failure, keep the button visible and inject a temporary error tooltip near the button (e.g. "No captions found — captions are required") that auto-dismisses after 4 seconds. No side panel interaction needed — the error is surfaced at the trigger point.

### 1c. Dead file removal

**File:** `ai/openai.js`

`ai/openai.js` is a one-line re-export that nothing imports. Delete it.

---

## 2. Icons

**Chosen direction:** C — Infinity loop (figure-8 with play triangle at the crossing point).

**Implementation:** Create SVG files directly (`icons/icon16.svg`, `icons/icon48.svg`, `icons/icon128.svg`). Chrome MV3 supports SVG icons natively — no PNG conversion or build step needed. Update `manifest.json` to reference `.svg` instead of `.png`.

**Palette:** `#7c3aed` (primary purple) for the infinity loop, `#a78bfa` (light purple) for the play triangle. Dark background: transparent.

**Sizes:** 16×16, 48×48, 128×128.

---

## 3. Timestamped Transcript

This is the foundation for feature I (timestamp linkback) and affects multiple files.

### 3a. Transcript format change

**Current:** `fetchTranscript` returns a plain `string`.

**New:** Returns an array of segments:
```js
[{ t: 12.5, text: "Welcome to this tutorial" }, ...]
```
where `t` is the start time in seconds (parsed from the caption XML `start` attribute).

`parseTranscriptXML` is updated to return this array. A new helper `transcriptToPlainText(segments)` produces the concatenated string for providers that need it.

### 3b. Background + provider changes

`handleGenerateSession` receives `{ transcript: Segment[], videoTitle }`. It calls `transcriptToPlainText(transcript)` to produce the string passed to AI providers. The providers are unchanged — they still receive a plain string.

The `GENERATE_SESSION` message payload and `state.transcript` in `main.js` both change from `string` to `Segment[]`. `state.transcript` is persisted and restored via `chrome.storage.session` as before (JSON-serialisable).

### 3c. AI prompt changes (all four providers)

`generateQuiz` system prompt is updated to instruct the AI to embed timestamps in `explanation` fields using a `[t=NNs]` marker format (e.g. `"[t=272s] This is explained at 4:32 in the video"`). The user prompt includes a compact timestamped transcript: `"[00:12] Welcome to..."` — one line per segment, capped at 6000 chars.

`evaluateAnswer` receives the plain text transcript (no timestamps needed).

### 3d. Rendering timestamp links in main.js

A helper `renderExplanation(text, containerEl)` parses `[t=NNs]` markers out of explanation text and replaces them with `<a href="#" class="timestamp-link" data-t="NN">4:32</a>` elements. These links post a `SEEK_VIDEO` message to `background.js`.

`background.js` handles `SEEK_VIDEO: { tabId, t }` by calling `chrome.scripting.executeScript` with `world:'MAIN'` to set `document.querySelector('video').currentTime = t`.

---

## 4. Syntax Highlighting (CodeMirror)

**Library choice:** CodeMirror 5 (classic), downloaded locally as two files:
- `sidepanel/vendor/codemirror.min.js` (~150 KB)
- `sidepanel/vendor/codemirror.min.css`

CodeMirror 6 requires a bundler; CM5 works as a drop-in script include. Features covered: syntax highlighting (JavaScript mode), bracket matching, auto-indent, line numbers.

**Integration:** In `sidepanel/index.html`, replace `<textarea id="ide-editor">` with a `<div id="ide-editor-wrap">`. In `main.js`, initialise `CodeMirror(document.getElementById('ide-editor-wrap'), { mode: 'javascript', lineNumbers: true, matchBrackets: true, indentWithTabs: false, tabSize: 2 })`. Store the CM instance in a module-level `let editor`. Replace all `ide-editor.value` reads/writes with `editor.getValue()` / `editor.setValue('')`. The `renderChallenge` call sets the starter code via `editor.setValue(challenge.starterCode)`.

The Ctrl/Cmd+Enter shortcut is handled via CM's `extraKeys` option instead of the manual `keydown` listener (which is removed).

---

## 5. Predict-Output Text-Input Mode

**File:** `sidepanel/main.js`, `sidepanel/index.html`

For questions where `q.type === 'predict-output'`, instead of rendering option buttons, render a `<textarea id="quiz-freetext">` with placeholder "Type the exact output…". On submit, compare `userAnswer.trim()` against `String(q.options[q.correctOption]).trim()` (the correct option text). Show pass/fail feedback the same way as multiple-choice. No AI evaluation call needed — it's a deterministic string comparison.

---

## 6. Extension Options Page

### 6a. Files

- `options/index.html`
- `options/options.js`
- `options/options.css` (shares design tokens from `sidepanel/style.css`)
- Register in `manifest.json`: `"options_page": "options/index.html"`

### 6b. Settings

| Setting | Type | Default | Notes |
|---|---|---|---|
| Provider | Select | anthropic | Same options as current popup |
| API Key | Password input | — | Required |
| Model | Select or text | provider default | Dynamic like sidepanel |
| Quiz difficulty | Select: Easy / Medium / Hard | Medium | Passed in AI prompt as instruction |
| Auto-start | Toggle | Off | If on, fires on video load instead of requiring button click |
| Min watch % | Range 0–90, step 5 | 0 | Only relevant when auto-start is on |

Quiz difficulty affects `generateQuiz` system prompt: Easy = "straightforward recall questions", Medium = "mix of recall and application", Hard = "application and edge-case questions that require deep understanding."

Difficulty is stored in `llmConfig` alongside `provider`, `apiKey`, `model`.

### 6c. Popup redesign

`popup/index.html` + `popup/popup.js` become a minimal status widget:
- Shows current provider + model (or "Not configured")
- "Open Settings" button → `chrome.runtime.openOptionsPage()`
- "Open Side Panel" button → `chrome.tabs.query` + `chrome.sidePanel.open()`

### 6d. In-panel settings screen

The in-panel settings screen (`idle-settings` in `sidepanel/index.html`) keeps API key + provider + model (needed for first-run, before the user has navigated to the options page). It adds a "More settings →" link that opens the options page.

Quiz difficulty, auto-start, and min watch % are options-page-only settings.

---

## 7. Auto-Start & Min Watch % (Feature A extension)

**File:** `content/content.js`

The `onNewVideo` function currently always injects the start button. With the new `autoStart` setting:
- If `autoStart === true`: watch `video.timeupdate`; when `video.currentTime / video.duration >= minWatchPct / 100`, call `triggerSession` automatically (no button).
- If `autoStart === false` (default): inject the button as today.

`content.js` reads `llmConfig` from `chrome.storage.local` at video load time to check `autoStart` and `minWatchPct`.

---

## 8. Data Flow Summary

```
content.js
  fetchTranscript() → Segment[]
  → chrome.runtime.sendMessage VIDEO_DETECTED { videoId, title, transcript: Segment[] }

background.js
  chrome.storage.session.set({ pendingSession: { title, transcript: Segment[] } })
  → chrome.sidePanel.open()

main.js (restoreOrInit)
  reads pendingSession → state.transcript = Segment[]
  startSession() → GENERATE_SESSION { transcript: Segment[], videoTitle }

background.js (handleGenerateSession)
  transcriptToPlainText(transcript) + timestamped compact string
  → ai.generateSummary(plainText, title)
  → ai.generateQuiz(timestampedText, title)   ← includes timestamps
  → ai.generateChallenge(plainText, title)

main.js (quiz render)
  renderExplanation(q.explanation) → parses [t=NNs], renders <a> links
  click → chrome.runtime.sendMessage SEEK_VIDEO { t }

background.js
  chrome.scripting.executeScript world:MAIN → video.currentTime = t
```

---

## 9. Files Touched

| File | Change |
|---|---|
| `manifest.json` | Add `options_page`, update icon paths |
| `background.js` | Add `SEEK_VIDEO` handler |
| `content/content.js` | `parseTranscriptXML` returns segments; auto-start logic |
| `ai/provider.js` | `generateQuiz` prompt contract updated (timestamped input) |
| `ai/anthropic.js` | Quiz prompt + timestamped transcript |
| `ai/openai-compatible.js` | Same |
| `ai/gemini.js` | Same |
| `ai/index.js` | No change |
| `ai/openai.js` | **Delete** |
| `sidepanel/index.html` | CM editor div, timestamp link styles |
| `sidepanel/main.js` | CM init, predict-output mode, `renderExplanation`, SEEK_VIDEO |
| `sidepanel/style.css` | Timestamp link styles |
| `sidepanel/vendor/` | Add `codemirror.min.js`, `codemirror.min.css`, `codemirror-javascript.min.js` |
| `popup/index.html` | Redesign as status widget |
| `popup/popup.js` | Status + openOptionsPage + openSidePanel |
| `options/index.html` | New |
| `options/options.js` | New |
| `options/options.css` | New |
| `icons/` | Regenerated 16, 48, 128 PNG (or SVG) |
| `icons/icon16.svg` | New SVG icon |
| `icons/icon48.svg` | New SVG icon |
| `icons/icon128.svg` | New SVG icon |

---

## 10. What Is NOT in Scope

- Monaco Editor / CodeMirror 6 (CM5 chosen for no-bundler simplicity)
- Gemini provider (already done)
- Back navigation, reset, error screen (already done)
- Session persistence (already done)
- Keyboard shortcut (already done — migrated to CM extraKeys)
