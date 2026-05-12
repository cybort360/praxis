# Praxis Redesign — Design Spec
## Rename + Session History + Transcript Viewer + AI Chat

**Date:** 2026-05-12

---

## Goal

Rename the extension from LearnLoop to Praxis and add three features that turn it from a one-shot quiz tool into a more complete learning companion: session history (so past sessions are never lost), a transcript viewer (so users can browse and seek by text), and AI chat (so users can ask follow-up questions about any video).

---

## Architecture

New code is split into two new script files (`history.js`, `chat.js`) loaded alongside the existing `main.js`. Each file exposes its API as globals (matching the no-bundler, no-module pattern of the existing codebase). `main.js` calls into them at the right lifecycle moments. The existing screen-based navigation pattern is extended — one new screen added (`screen-history`), one existing screen extended (`screen-summary` gets tabs), one new persistent UI region added (the chat drawer, outside all screens).

**File map:**

| File | Change |
|---|---|
| `manifest.json` | Rename `"name"` field |
| `sidepanel/index.html` | Rename copy; add history screen HTML; add summary tabs; add chat drawer HTML; add script tags |
| `sidepanel/style.css` | Styles for history cards, tabs, chat drawer |
| `sidepanel/main.js` | Save session on summary load; transcript tab rendering; show/hide chat drawer |
| `sidepanel/history.js` | New — all history logic |
| `sidepanel/chat.js` | New — all chat logic |
| `background.js` | Add `CHAT_MESSAGE` handler |
| `ai/gemini.js` | Add `chat(messages, transcript)` method |
| `ai/openai-compatible.js` | Add `chat(messages, transcript)` method |
| `ai/provider.js` | Add abstract `chat()` stub |
| `options/index.html` | Rename copy |
| `popup/index.html` | Rename copy |
| `README.md` | Rename all mentions |

---

## Section 1: Rename (LearnLoop → Praxis)

Find-and-replace across all files listed above. The ∞ icon is abstract and requires no change. No logic changes — purely copy and metadata.

Files touched: `manifest.json`, `sidepanel/index.html`, `options/index.html`, `popup/index.html`, `README.md`.

---

## Section 2: Session History

### Storage

`chrome.storage.local` key: `praxisHistory` — an array of up to 50 session objects, newest first. When a new session is saved and the array exceeds 50 entries, the oldest is dropped.

Each entry:
```json
{
  "id": "<timestamp-ms>",
  "videoTitle": "Rust Ownership Explained",
  "platform": "YouTube",
  "url": "https://www.youtube.com/watch?v=...",
  "date": 1747000000000,
  "quizScore": 2,
  "quizTotal": 3,
  "challengePassed": true,
  "summary": "2-3 sentence summary text",
  "keyPoints": ["point 1", "point 2", "point 3"]
}
```

`platform` is inferred from the URL hostname: `youtube.com` → "YouTube", `udemy.com` → "Udemy", `coursera.org` → "Coursera", anything else → the bare hostname.

### When sessions are saved

`History.saveSession(sessionData)` is called from `main.js` inside `renderSummary()`, immediately after `state.summary` is populated. `quizScore`, `quizTotal`, and `challengePassed` default to `null` at save time and are never updated retroactively — the summary is what's persisted, not the full outcome. (Outcome tracking is future scope.)

### New file: `sidepanel/history.js`

Exports four globals:

- `History.saveSession(data)` — appends to storage, trims to 50
- `History.loadHistory()` → `Promise<entry[]>` — reads from storage
- `History.renderHistory()` — populates `#history-list` and attaches expand/collapse handlers
- `History.clearHistory()` — wipes `praxisHistory` from storage and clears the list DOM

### New screen: `screen-history`

A clock/history icon (`ic-history`) is added to the top toolbar between the reset and theme buttons. Visible only when a key exists in storage (checked on load). Clicking it calls `showScreen('screen-history')` and records `previousScreen` so the back button can return correctly.

Each history card:
```
┌─────────────────────────────────────┐
│ Rust Ownership Explained            │
│ YouTube · 3 days ago      [2/3 ✓]  │
└─────────────────────────────────────┘
```

Tapping a card toggles an expanded section showing the summary paragraph and key points as a bullet list. A "Clear history" text button lives at the bottom of the list. If history is empty, a placeholder message is shown: "No sessions yet — complete a video to see your history here."

### Back navigation

A `previousScreen` variable in `main.js` records the active screen before navigating to history. The back button on `screen-history` calls `showScreen(previousScreen)`.

---

## Section 3: Transcript Viewer

### Tab bar on `screen-summary`

The summary screen gets a two-tab bar at the top:

```
[ Summary ]  [ Transcript ]
```

The existing summary content (title, paragraph, key points, Start Quiz button) is wrapped in a `tab-panel` div with `data-tab="summary"`. A second `tab-panel` with `data-tab="transcript"` holds the transcript list.

Tab switching is handled in `main.js` by a small `initSummaryTabs()` function (~25 lines): clicking a tab adds `active` to its panel and removes it from the other.

### Transcript panel

A scrollable `<div class="transcript-list">` containing one row per segment:

```
0:42   In this video we're going to look at...
1:15   The first thing you need to understand...
```

Each row is a `<button>` (for keyboard accessibility). The timestamp column is fixed-width, muted, monospace. Clicking a row sends `SEEK_VIDEO` with the segment's `t` value — the same message handler already in `background.js`. The clicked row gets a brief `highlight` CSS animation (flash to accent colour, fade out over 600ms) to confirm the seek.

### Data source

`state.transcript` is already populated when `renderSummary()` runs. `renderTranscript()` maps over it directly — no new storage or network calls.

---

## Section 4: AI Chat

### Bottom drawer

A `<div id="chat-drawer">` is placed at the bottom of `sidepanel/index.html`, outside all `.screen` divs. It is hidden (`display:none`) until `chat.init()` is called. It never scrolls with screen content — it is fixed to the bottom of the panel via CSS (`position: sticky` on the panel's flex layout, or `position: fixed` with matching bottom padding on screens).

**Collapsed state** (~52px tall): a single text input with placeholder "Ask about this video…" and a send button. The input is not a `<textarea>` — it is a single-line `<input type="text">` for simplicity.

**Expanded state** (~40% of panel height): clicking the input expands the drawer upward, revealing a scrollable message list above the input. Messages are rendered as bubbles — user messages right-aligned, assistant messages left-aligned. Clicking outside the drawer or pressing Escape collapses it (but does not clear the conversation).

### New file: `sidepanel/chat.js`

Exposes:
- `Chat.init(transcript, videoTitle)` — stores context, shows the drawer, clears any previous conversation
- `Chat.reset()` — hides the drawer, clears conversation history and DOM

Internally manages:
- `messages` array — `[{ role: 'user'|'assistant', content: string }]`
- DOM rendering of bubbles
- Expand/collapse state
- Sending messages: appends user bubble immediately, sends `CHAT_MESSAGE` to background, appends assistant bubble on response

### Loading state

While waiting for the AI response, a typing indicator (three animated dots) is shown as the assistant bubble. It is replaced by the actual response on arrival. The input is disabled during the request.

### New message handler: `CHAT_MESSAGE` in `background.js`

```js
case 'CHAT_MESSAGE': {
  const { messages, transcript, videoTitle } = message.payload;
  handleChat({ messages, transcript, videoTitle })
    .then(result => sendResponse({ ok: true, data: result }))
    .catch(err  => sendResponse({ ok: false, error: err.message }));
  return true;
}
```

### New AI method: `chat(messages, transcript, videoTitle)`

Added to `GeminiProvider`, `OpenAICompatibleProvider`, and as an abstract stub in `AIProvider`.

System prompt:
> "You are a concise tutor helping a learner understand a video they just watched. Answer questions using only the content of the video transcript. If the answer is not in the transcript, say so. Keep answers to 2–3 sentences unless a longer explanation is clearly needed."

The full `messages` array (including prior turns) is passed to the API so context accumulates naturally across the conversation. Transcript is prepended to the system prompt (first 6000 chars).

For Gemini, prior turns are passed as `contents` with alternating `user`/`model` roles. For OpenAI-compatible, they are passed as the `messages` array directly after the system message.

### Conversation lifecycle

- Starts when `Chat.init()` is called (summary loads)
- Persists across tab switches (Summary ↔ Transcript) and screen navigations within the session
- Resets when the user clicks the reset button or starts a new session (`Chat.reset()` called from `resetState()` in `main.js`)
- Not persisted to storage — chat history is in-memory only

---

## Error handling

- **History save fails:** Silently swallow the error — history is a nice-to-have, never block the main flow.
- **Chat request fails:** Show an error bubble: "Something went wrong — try again." Re-enable the input.
- **Transcript tab with no transcript:** Show a placeholder: "Transcript not available for this session."

---

## Self-Review

**Placeholder scan:** No TBDs or TODOs found.

**Internal consistency:**
- `previousScreen` pattern for history back-navigation matches the existing `showScreen()` architecture.
- `Chat.init()` called in `renderSummary()` — consistent with where the transcript becomes available.
- `History.saveSession()` called in `renderSummary()` — correct, summary data is available there.
- Gemini multi-turn: Gemini API uses `user`/`model` roles (not `assistant`) — the `chat()` method in `gemini.js` must map `assistant` → `model` before sending.

**Scope:** Focused. No spaced repetition, no export, no notes — those are future features.

**Ambiguity resolved:**
- Chat drawer expand/collapse: clicking outside collapses but does NOT clear conversation.
- History entries are immutable after save — quiz/challenge outcomes are not retroactively updated.
- Transcript viewer only available during an active session (Summary screen), not from history view.
