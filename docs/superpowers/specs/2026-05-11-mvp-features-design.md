# LearnLoop MVP Features — Design Spec
Date: 2026-05-11

## Scope

Six items from the build order (items 4–9 in `projectspec.md`):

| Item | Type | Description |
|------|------|-------------|
| Feature A | New | Manual start trigger + 30% watch gate |
| Feature C | New | Error state screen (replace `alert()`) |
| Feature E | New | Reset button |
| Feature F | New | Back navigation |
| Feature B | New | Session persistence across panel close/reopen |
| Feature D | New | Ctrl/Cmd+Enter to run code |
| Bug #3 | Fix | Quiz pass gate + dedicated fail screen |

Approach: feature-by-feature, minimal footprint. No structural refactoring.

---

## Feature A — Manual Start Trigger + Watch Percentage Gate

**Files:** `content/content.js` only.

### Current behaviour
`onNewVideo()` auto-fires immediately, extracts the transcript, sends `VIDEO_DETECTED`.

### New behaviour
`onNewVideo()` detects the video but does not start the session. Instead it:
1. Injects a floating "▶ Start LearnLoop" button into `document.body`.
2. Attaches a `timeupdate` listener on `document.querySelector('video')`.

Either action calls `triggerSession(videoId)`:
- User clicks the button
- `video.currentTime / video.duration >= 0.3`

`triggerSession()`:
1. Guards against double-firing with an `isTriggering` flag.
2. Removes the button and tears down the `timeupdate` listener.
3. Calls the existing `fetchTranscript(videoId)` pipeline.
4. On success: sends `VIDEO_DETECTED` to background (which stores to `chrome.storage.session` and opens the panel).
5. On failure: removes button silently (bug #6 is a separate item).

### Button appearance
Injected inline — no external stylesheet dependency:
- `position: fixed`, bottom-right corner, `z-index: 9999`
- Purple background (`#7c3aed`), white text, rounded pill
- Removed on trigger or on navigation to a new video

### Edge cases
- New video navigation: `onNewVideo` tears down existing button and listener before creating new ones.
- Button clicked during transcript extraction: `isTriggering` flag prevents re-entry.
- No transcript available: error caught, button removed, session does not start.

---

## Features C, E, F — Error Screen, Reset, Back Navigation

**Files:** `sidepanel/index.html`, `sidepanel/main.js`.

### Feature C — Error screen

New `#screen-error` added to `index.html`:
- Heading: "Something went wrong"
- `<p id="error-message">` — populated dynamically
- **Try Again** button (`#btn-retry`): re-calls `startSession()` (transcript + title already in `state`)
- **Start Over** button (`#btn-error-reset`): resets state, removes `savedSession` from `chrome.storage.session`, shows idle screen

`main.js`: both `alert()` calls replaced with `showError(message)` helper.

### Feature E — Reset button

`<button id="btn-reset">` added to `index.html`, fixed-position top-right.

Behaviour:
- Resets the `state` object to its initial values
- Calls `chrome.storage.session.remove('savedSession')`
- Calls `showScreen('screen-idle')`

Visibility: hidden on the idle screen, visible on all other screens. Toggled inside `showScreen()` — if target is `screen-idle`, add `hidden` class; otherwise remove it.

### Feature F — Back navigation

Two back buttons, each in the relevant screen header:

| Screen | Back destination | Quiz state on back |
|--------|-----------------|-------------------|
| `#screen-quiz` | `#screen-summary` | `quizIndex` and `quizPassed` reset to 0 |
| `#screen-challenge` | `#screen-quiz` quiz-complete view | No question reset; `quiz-complete` div stays visible, `quiz-question-wrap` stays hidden |

Back buttons are absent from Summary and Idle screens (no logical back destination).

---

## Feature B — Session Persistence

**Files:** `sidepanel/main.js` only.

### Storage keys

| Key | Written by | Purpose |
|-----|-----------|---------|
| `pendingSession` | `background.js` | Transcript + title for new session trigger (already implemented) |
| `savedSession` | `main.js` | Full session state for persistence across panel close/reopen |

### `savedSession` shape
```js
{
  videoTitle, transcript,
  summary, quiz, challenge,
  quizIndex, quizPassed,
  currentScreen   // 'summary' | 'quiz' | 'challenge'
}
```

### When `persistState()` is called
1. After `GENERATE_SESSION` succeeds — saves full session, `currentScreen: 'summary'`
2. After each quiz Next click that advances to another question (`quizIndex < quiz.length`) — saves `quizIndex`, `quizPassed`, `currentScreen: 'quiz'`
3. After the quiz pass gate succeeds (quiz-complete div shown) — saves `quizIndex: quiz.length`, `quizPassed`, `currentScreen: 'quiz'`
4. After navigating to challenge — saves `currentScreen: 'challenge'`

`persistState()` is NOT called on quiz fail — a failed attempt does not overwrite saved progress.

`persistState()` is a single helper that serialises the relevant fields and calls `chrome.storage.session.set({ savedSession: ... })`.

### Startup sequence (panel load)
1. Check `savedSession` → if found, restore `state`, then:
   - `currentScreen: 'summary'` → render summary, show summary screen
   - `currentScreen: 'quiz'` and `quizIndex < quiz.length` → render question at `quizIndex`, show quiz screen
   - `currentScreen: 'quiz'` and `quizIndex >= quiz.length` → show quiz screen in completed state (`quiz-complete` div visible, `quiz-question-wrap` hidden) — this handles the case where the user passed but closed the panel before clicking "Open Challenge"
   - `currentScreen: 'challenge'` → render challenge, show challenge screen
2. If no `savedSession`: check `pendingSession` → start new session (existing flow).
3. If neither: show idle screen.

### Reset
Reset button calls `chrome.storage.session.remove('savedSession')` before going to idle. Error screen "Start Over" does the same.

---

## Feature D — Ctrl/Cmd+Enter to Run Code

**Files:** `sidepanel/main.js` only.

```js
document.getElementById('ide-editor').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runCode(e.target.value);
  }
});
```

`metaKey` covers Cmd+Enter on Mac. Calls existing `runCode()` — no duplication.

---

## Bug #3 — Quiz Pass Gate + Fail Screen

**Files:** `sidepanel/index.html`, `sidepanel/main.js`.

### Pass threshold
`Math.ceil(quiz.length * 0.67)` — 2 of 3 questions correct.

### Pass gate (in `btn-quiz-next` handler, at quiz completion branch)
```js
const threshold = Math.ceil(state.quiz.length * 0.67);
if (state.quizPassed >= threshold) {
  // existing success path — show quiz-complete div
} else {
  document.getElementById('fail-score').textContent =
    `You got ${state.quizPassed} of ${state.quiz.length} — need ${threshold} to continue.`;
  showScreen('screen-quiz-fail');
}
```

### New `#screen-quiz-fail`
- Heading: "Not quite"
- `<p id="fail-score">` — score populated dynamically
- Short encouragement line
- **Try Again** button: shuffles `state.quiz` (Fisher-Yates), resets `quizIndex` and `quizPassed` to 0, resets quiz UI state (`quiz-complete` hidden, `quiz-question-wrap` visible), calls `renderQuizQuestion()`, shows quiz screen
- **Back to Summary** button: same quiz reset, shows summary screen

### Persistence on fail
`persistState()` is not called on fail — a failed attempt does not overwrite saved progress.

---

## Files Changed

| File | Changes |
|------|---------|
| `content/content.js` | Remove auto-trigger; add injected button, `timeupdate` listener, `triggerSession()` |
| `sidepanel/index.html` | Add `#screen-error`, `#screen-quiz-fail`, `#btn-reset`, back buttons |
| `sidepanel/main.js` | All feature logic: error screen, reset, back nav, persistence, Ctrl+Enter, pass gate |

`background.js`, `ai/`, `popup/` — no changes.
