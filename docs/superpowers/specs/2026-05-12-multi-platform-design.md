# Multi-Platform Support Design

> **Status:** Approved — ready for implementation planning

## Goal

Extend LearnLoop to work on any learning platform that serves video with standard HTML5 captions/subtitles, shipping enabled by default on the five most popular platforms (Udemy, Coursera, LinkedIn Learning, Khan Academy, Pluralsight) and allowing users to add custom sites.

## Architecture

Two content scripts run in parallel — each has a single, clear job:

| Script | Runs on | Transcript method |
|---|---|---|
| `content/content.js` | YouTube only (unchanged) | `ytInitialPlayerResponse` → XML parse |
| `content/generic.js` | Everything else (configurable) | HTML5 `<track>` → VTT fetch + parse |

Background, sidepanel, AI layer, and popup are **untouched**. `generic.js` sends the identical `VIDEO_DETECTED` message YouTube sends, so all downstream logic works for free.

## Storage

A new `chrome.storage.local` key `platformConfig` holds the allow-list:

```js
{
  enabled: string[]  // hostname or hostname/path prefix: ['www.udemy.com', 'www.linkedin.com/learning/']
}
```

Default (written on first install / if key is missing):
```js
['www.udemy.com', 'www.coursera.org', 'www.linkedin.com/learning/', 'www.khanacademy.org', 'app.pluralsight.com']
```

**Matching logic:** `(location.hostname + location.pathname).startsWith(entry)` — hostname-only entries match the whole domain; path-prefixed entries (like LinkedIn Learning) match only within that path. This prevents the LearnLoop button appearing on regular LinkedIn feed pages that aren't course content.

## `content/generic.js` — Behaviour

### 1. Allow-list guard (runs immediately on inject)
Reads `platformConfig.enabled` from storage. If `location.hostname` is not in the list, the script calls `return` and does nothing. Cost: one async storage read, no DOM touches.

### 2. Video + track detection
Sets up a `MutationObserver` on `document.body` (`childList: true, subtree: true, attributes: true, attributeFilter: ['src']`) watching for:
- A `<video>` element gaining a `<track kind="subtitles">` or `<track kind="captions">` child
- An existing `<track>` whose `src` attribute changes from empty to a real URL

Track priority: English captions > any captions > English subtitles > any subtitles.

If no qualifying `<track src>` is found within **8 seconds** of the script starting (or of a new URL being detected), the button is not shown. No false positives.

### 3. SPA navigation detection
Two mechanisms run together:
- `window.addEventListener('popstate', ...)` — catches browser back/forward
- A **500 ms `setInterval`** polling `location.href` — catches `pushState` navigation used by Udemy, Coursera, etc. The interval is paused when `document.visibilityState === 'hidden'` to avoid burning cycles in background tabs.

When a URL change is detected: tear down the existing button, reset all state flags, re-run detection from step 2.

Video identity = `location.href`. A URL change means a new video.

### 4. Button injection
Identical visual style to the YouTube button (gradient pill, play SVG icon, spinner on load). Calls `triggerSession()` on click.

### 5. Transcript extraction
On `triggerSession()`:
1. Find the best `<track>` on `document.querySelector('video')`.
2. Attempt `fetch(track.src)` from the page context.
3. If that fails for any reason, send a `FETCH_VTT` message to background.js, which retries from the extension origin (not subject to page CORS restrictions).
4. Parse the VTT text into `{ t: number, text: string }[]` — strip cue IDs, timing lines, WebVTT inline tags (`<c>`, `<i>`, `<b>`, `<timestamp>`), blank lines.
5. Send `VIDEO_DETECTED` with `{ videoId: location.href, title: document.title, transcript }`.

If no track src, or fetch fails even from background, show toast: _"No captions found — enable captions in the video player first."_

### 6. Context guard
Identical `isContextAlive()` / `safeChrome()` guards from `content.js` — copied into `generic.js` (no shared import mechanism in MV3 content scripts without a bundler).

## `background.js` — Changes

One new message handler:

```js
case 'FETCH_VTT': {
  // sender is the content script; fetch the URL from extension origin
  fetch(message.payload.url)
    .then(r => r.text())
    .then(text => sendResponse({ ok: true, text }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
}
```

No other background changes.

## `manifest.json` — Changes

### New content script entry
```json
{
  "matches": ["*://*/*"],
  "js": ["content/generic.js"],
  "run_at": "document_idle",
  "exclude_matches": [
    "https://www.youtube.com/*",
    "https://youtube.com/*"
  ]
}
```

### New optional host permissions
```json
"optional_host_permissions": [
  "*://*.udemy.com/*",
  "*://*.coursera.org/*",
  "*://*.linkedin.com/*",
  "*://*.khanacademy.org/*",
  "*://*.pluralsight.com/*",
  "*://*/*"
]
```

## Options Page — Changes

A new **Platforms** card inserted between Quiz and Auto-Start sections.

### Default platform toggles (5 rows)
Each row: platform name + hostname label + toggle switch. Matches the existing toggle switch component used for Auto-Start.

| Platform | Hostname |
|---|---|
| Udemy | www.udemy.com |
| Coursera | www.coursera.org |
| LinkedIn Learning | www.linkedin.com |
| Khan Academy | www.khanacademy.org |
| Pluralsight | app.pluralsight.com |

### Custom site input
Below the defaults: a text input (`placeholder="e.g. egghead.io"`) + "Add" button. On submit:
- Strip `http://`, `https://`, trailing slashes
- Validate: must match `/^[a-z0-9][a-z0-9\-\.]+\.[a-z]{2,}$/i`
- If valid and not already in list: append as a new toggle row with a remove (×) button
- If invalid: show inline error "Enter a valid hostname"

### Storage sync
Every toggle change immediately updates `platformConfig.enabled` in `chrome.storage.local`.

### `options.js` changes
- `load()` reads `platformConfig` and sets toggle states
- `save()` now saves both `llmConfig` and `platformConfig`
- Platform toggles update storage individually on `change` (not waiting for Save button)
- Custom site add/remove also updates storage immediately

## VTT Parser — Spec

Input: raw VTT string. Output: `{ t: number, text: string }[]`.

Steps:
1. Split on `\n\n` to get cue blocks.
2. Skip the `WEBVTT` header block and any `NOTE` blocks.
3. For each remaining block, split on `\n`.
4. Find the timing line (contains ` --> `). The start timestamp before ` --> ` is the cue start.
5. Parse timestamp `HH:MM:SS.mmm` or `MM:SS.mmm` → seconds (`h*3600 + m*60 + s + ms/1000`).
6. Join remaining lines (after the timing line) as the cue text.
7. Strip WebVTT tags: remove `<[^>]+>` with regex.
8. Strip HTML entities: `&amp;` → `&`, `&#39;` → `'`, `&lt;` → `<`, `&gt;` → `>`.
9. Trim. Skip empty cues.

## Error States

| Situation | User-visible result |
|---|---|
| Hostname not in allow-list | Script exits silently — no button |
| Video found, no `<track>` within 8 s | No button shown |
| Track found, VTT fetch fails (page + background both fail) | Toast: "No captions found — enable captions in the video player first." |
| Extension context invalidated | Same guard as YouTube script — toast: "Extension was reloaded — please refresh the page." |

## What Does Not Change

- `content/content.js` — untouched
- `background.js` AI handlers — untouched
- Sidepanel HTML/CSS/JS — untouched
- Popup — untouched
- `SEEK_VIDEO` handler — already uses `document.querySelector('video').currentTime` which is generic and works on all platforms
