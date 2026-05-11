# Multi-Platform Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic content script that makes LearnLoop work on Udemy, Coursera, LinkedIn Learning, Khan Academy, Pluralsight, and any user-added site that serves video with HTML5 captions.

**Architecture:** A new `content/generic.js` runs on all sites except YouTube, bails out immediately if the hostname isn't in the stored allow-list, then watches for `<video>` + `<track>` elements and injects the same "Start LearnLoop" button. It sends the identical `VIDEO_DETECTED` message YouTube sends, so the entire sidepanel/AI pipeline works untouched. The options page gets a Platforms card for managing the allow-list.

**Tech Stack:** Chrome Extension MV3, vanilla JS (no bundler — content scripts are self-contained IIFEs), chrome.storage.local, HTML5 `<track>` / WebVTT.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `content/generic.js` | **Create** | New generic content script (full implementation) |
| `background.js` | **Modify** | Add `FETCH_VTT` message handler |
| `manifest.json` | **Modify** | Add generic.js content script entry + optional_host_permissions |
| `options/index.html` | **Modify** | Add globe SVG symbol + Platforms card HTML |
| `options/options.css` | **Modify** | Add platform row, add-site input, remove button styles |
| `options/options.js` | **Modify** | Load/save platformConfig, render platform rows, custom site add/remove |

---

## Task 1: Create `content/generic.js`

**Files:**
- Create: `content/generic.js`

This is the entire generic content script. It is self-contained — no imports. Copy the context guard pattern from `content/content.js` (there is no shared module system available in MV3 content scripts without a bundler).

- [ ] **Step 1: Create the file with the full implementation**

Create `content/generic.js` with this exact content:

```js
// content/generic.js — Generic learning platform content script
// Declared in manifest with *://*/* but excludes YouTube.
// Exits immediately if the current hostname is not in the user's allow-list.
(function () {
  'use strict';

  const DEFAULT_PLATFORMS = [
    'www.udemy.com',
    'www.coursera.org',
    'www.linkedin.com/learning/',
    'www.khanacademy.org',
    'app.pluralsight.com',
  ];

  // ── Context guard ─────────────────────────────────────────────────────────
  function isContextAlive() {
    try { return !!chrome.runtime?.id; } catch (_) { return false; }
  }

  async function safeChrome(fn) {
    if (!isContextAlive()) return null;
    try {
      return await fn();
    } catch (e) {
      if (e.message?.includes('context invalidated')) { stopAll(); return null; }
      throw e;
    }
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let startButton    = null;
  let sessionStarted = false;
  let isTriggering   = false;
  let currentUrl     = location.href;
  let detectTimer    = null;
  let navInterval    = null;

  // ── Allow-list check ──────────────────────────────────────────────────────
  async function isAllowed() {
    const stored = await safeChrome(() => chrome.storage.local.get('platformConfig'));
    if (!stored) return false;
    const list   = stored.platformConfig?.enabled ?? DEFAULT_PLATFORMS;
    const urlKey = location.hostname + location.pathname;
    return list.some(entry => urlKey.startsWith(entry));
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    if (!isContextAlive()) return;
    if (!(await isAllowed())) return;
    startNavWatcher();
    startDetection();
  }

  // ── Teardown ──────────────────────────────────────────────────────────────
  function teardown() {
    if (startButton)  { startButton.remove(); startButton = null; }
    if (detectTimer)  { clearTimeout(detectTimer); detectTimer = null; }
    sessionStarted = false;
    isTriggering   = false;
  }

  function stopAll() {
    if (navInterval) { clearInterval(navInterval); navInterval = null; }
    observer.disconnect();
    teardown();
  }

  // ── SPA navigation ────────────────────────────────────────────────────────
  function startNavWatcher() {
    window.addEventListener('popstate', onUrlChange);
    navInterval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (location.href !== currentUrl) onUrlChange();
    }, 500);
  }

  function onUrlChange() {
    if (!isContextAlive()) { stopAll(); return; }
    currentUrl = location.href;
    teardown();
    observer.observe(document.body, OBSERVER_OPTS);
    detectTimer = setTimeout(() => observer.disconnect(), 8000);
    checkForTrack();
  }

  // ── Track detection ───────────────────────────────────────────────────────
  const OBSERVER_OPTS = {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['src'],
  };

  const observer = new MutationObserver(checkForTrack);

  function startDetection() {
    observer.observe(document.body, OBSERVER_OPTS);
    detectTimer = setTimeout(() => observer.disconnect(), 8000);
    checkForTrack(); // check immediately — track may already be in DOM
  }

  function getBestTrack(video) {
    const tracks = Array.from(video.querySelectorAll('track'));
    for (const kind of ['captions', 'subtitles']) {
      const en  = tracks.find(t => t.kind === kind && t.src && t.srclang?.startsWith('en'));
      if (en) return en;
      const any = tracks.find(t => t.kind === kind && t.src);
      if (any) return any;
    }
    return null;
  }

  function checkForTrack() {
    if (sessionStarted || startButton) return;
    const video = document.querySelector('video');
    if (!video) return;
    const track = getBestTrack(video);
    if (!track?.src) return;
    // Found a usable track — stop watching and show button
    observer.disconnect();
    if (detectTimer) { clearTimeout(detectTimer); detectTimer = null; }
    injectStartButton();
  }

  // ── Button ────────────────────────────────────────────────────────────────
  function iconPlay() {
    return `<svg viewBox="0 0 24 24" fill="currentColor"
              style="width:14px;height:14px;display:block;flex-shrink:0">
              <polygon points="5,3 19,12 5,21"/>
            </svg>`;
  }

  function iconSpinner() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round"
              style="width:14px;height:14px;display:block;flex-shrink:0">
              <circle cx="12" cy="12" r="9" stroke-opacity="0.25"/>
              <path d="M12 3a9 9 0 0 1 9 9">
                <animateTransform attributeName="transform" type="rotate"
                  from="0 12 12" to="360 12 12" dur="0.75s" repeatCount="indefinite"/>
              </path>
            </svg>`;
  }

  function setButtonState(label, iconHtml) {
    if (!startButton) return;
    startButton.innerHTML =
      `<span style="display:flex;align-items:center;gap:8px;pointer-events:none">
         ${iconHtml}<span>${label}</span>
       </span>`;
  }

  function injectStartButton() {
    if (startButton) return;
    startButton = document.createElement('button');
    startButton.id = '__ll_start_btn';
    Object.assign(startButton.style, {
      position: 'fixed', bottom: '80px', right: '20px', zIndex: '9999',
      background: 'linear-gradient(135deg,#7c6af7,#a78bfa)',
      color: '#fff', border: 'none', borderRadius: '9999px',
      padding: '10px 20px', fontSize: '14px', fontWeight: '600',
      cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,106,247,0.5)',
      transition: 'opacity .15s, transform .1s', lineHeight: '1',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    });
    setButtonState('Start LearnLoop', iconPlay());
    startButton.onmouseenter = () => {
      startButton.style.opacity   = '0.88';
      startButton.style.transform = 'translateY(-1px)';
    };
    startButton.onmouseleave = () => {
      startButton.style.opacity   = '1';
      startButton.style.transform = 'translateY(0)';
    };
    startButton.addEventListener('click', () => {
      if (!isContextAlive()) {
        showToast('Extension was reloaded — please refresh the page.');
        return;
      }
      triggerSession();
    });
    document.body.appendChild(startButton);
  }

  // ── Transcript extraction ─────────────────────────────────────────────────
  async function triggerSession() {
    if (isTriggering || sessionStarted) return;
    if (!isContextAlive()) {
      showToast('Extension was reloaded — please refresh the page.');
      return;
    }
    isTriggering = true;
    setButtonState('Loading…', iconSpinner());

    const video = document.querySelector('video');
    const track = video ? getBestTrack(video) : null;
    if (!track?.src) {
      resetButton();
      showToast('No captions found — enable captions in the video player first.');
      return;
    }

    const vttText = await fetchVTT(track.src);
    if (!vttText) {
      resetButton();
      showToast('No captions found — enable captions in the video player first.');
      return;
    }

    const transcript = parseVTT(vttText);
    if (!transcript.length) {
      resetButton();
      showToast('No captions found — enable captions in the video player first.');
      return;
    }

    if (!isContextAlive()) return;
    teardown();
    sessionStarted = true;
    await safeChrome(() =>
      chrome.runtime.sendMessage({
        type:    'VIDEO_DETECTED',
        payload: { videoId: location.href, title: document.title, transcript },
      })
    );
  }

  function resetButton() {
    isTriggering = false;
    setButtonState('Start LearnLoop', iconPlay());
  }

  async function fetchVTT(url) {
    // Try page-context fetch first
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch (_) { /* fall through to background fallback */ }
    // Fallback: background fetches from extension origin (no CORS restriction)
    const result = await safeChrome(() =>
      chrome.runtime.sendMessage({ type: 'FETCH_VTT', payload: { url } })
    );
    return result?.ok ? result.text : null;
  }

  // ── VTT parser ────────────────────────────────────────────────────────────
  function parseVTT(vtt) {
    const segments = [];
    const blocks   = vtt.split(/\n\n+/);
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (!lines.length) continue;
      if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) continue;
      const timingIdx = lines.findIndex(l => l.includes(' --> '));
      if (timingIdx === -1) continue;
      const t = parseTimestamp(lines[timingIdx].split(' --> ')[0].trim());
      if (t === null) continue;
      const text = lines.slice(timingIdx + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g,  '&')
        .replace(/&#39;/g,  "'")
        .replace(/&lt;/g,   '<')
        .replace(/&gt;/g,   '>')
        .trim();
      if (text) segments.push({ t, text });
    }
    return segments;
  }

  function parseTimestamp(ts) {
    const parts = ts.split(':');
    if (parts.length < 2) return null;
    const [sec, ms] = parts[parts.length - 1].split('.');
    const seconds   = parseInt(sec, 10) + (parseInt(ms || '0', 10) / 1000);
    const minutes   = parseInt(parts[parts.length - 2], 10);
    const hours     = parts.length === 3 ? parseInt(parts[0], 10) : 0;
    if (isNaN(seconds) || isNaN(minutes) || isNaN(hours)) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const tip = document.createElement('div');
    tip.textContent = msg;
    Object.assign(tip.style, {
      position: 'fixed', bottom: '130px', right: '20px', zIndex: '10000',
      background: '#1a1a22', color: '#e05c5c', border: '1px solid #e05c5c',
      borderRadius: '8px', padding: '8px 12px', fontSize: '12px',
      maxWidth: '240px', lineHeight: '1.4', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    });
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 4000);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  init();
})();
```

- [ ] **Step 2: Verify the file was created**

```bash
ls -lh content/
```
Expected output includes `generic.js`.

- [ ] **Step 3: Commit**

```bash
git add content/generic.js
git commit -m "feat: add generic content script for non-YouTube platforms"
```

---

## Task 2: Add `FETCH_VTT` handler to `background.js`

**Files:**
- Modify: `background.js` (add one `case` inside the existing `switch`)

- [ ] **Step 1: Open `background.js` and locate the `default:` case at the bottom of the switch**

The switch block ends with:
```js
    default:
      break;
  }
});
```

- [ ] **Step 2: Insert the new case immediately before `default:`**

Add this block so the switch looks like:

```js
    case 'FETCH_VTT': {
      // Content script fetch failed (CORS); retry from extension origin.
      fetch(message.payload.url)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .then(text => sendResponse({ ok: true, text }))
        .catch(err  => sendResponse({ ok: false, error: err.message }));
      return true; // keep message channel open for async response
    }

    default:
      break;
  }
});
```

- [ ] **Step 3: Verify the switch still has correct syntax**

```bash
node --input-type=module < background.js 2>&1 | head -5
```
Expected: no output (no syntax errors). If you see `Cannot use import statement`, that is fine — it means the module syntax is valid but Node can't resolve Chrome imports. Any other error means a syntax mistake.

- [ ] **Step 4: Commit**

```bash
git add background.js
git commit -m "feat: add FETCH_VTT handler for CORS fallback in background"
```

---

## Task 3: Update `manifest.json`

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add the generic content script entry**

Open `manifest.json`. Find the `"content_scripts"` array. It currently has one entry for YouTube. Add a second entry after it:

```json
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*", "https://youtube.com/*"],
      "js": ["content/content.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["*://*/*"],
      "js": ["content/generic.js"],
      "run_at": "document_idle",
      "exclude_matches": [
        "https://www.youtube.com/*",
        "https://youtube.com/*"
      ]
    }
  ],
```

- [ ] **Step 2: Add `optional_host_permissions`**

After the existing `"host_permissions"` array, add:

```json
  "optional_host_permissions": [
    "*://*.udemy.com/*",
    "*://*.coursera.org/*",
    "*://*.linkedin.com/*",
    "*://*.khanacademy.org/*",
    "*://*.pluralsight.com/*",
    "*://*/*"
  ],
```

- [ ] **Step 3: Validate JSON is well-formed**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('valid')"
```
Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add manifest.json
git commit -m "feat: register generic content script in manifest"
```

---

## Task 4: Options page HTML — Platforms card

**Files:**
- Modify: `options/index.html`

- [ ] **Step 1: Add the globe SVG symbol to the sprite**

In `options/index.html`, find the closing `</svg>` tag of the SVG sprite (after the `ic-zap` symbol). Add this symbol before it:

```html
    <symbol id="ic-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </symbol>
```

- [ ] **Step 2: Add the Platforms card between the Quiz and Auto-Start cards**

Find this comment in `options/index.html`:
```html
      <!-- Auto-Start -->
```

Insert the following block immediately before it:

```html
      <!-- Platforms -->
      <section class="card">
        <div class="card-header">
          <div class="card-icon-wrap teal">
            <svg class="icon icon-sm"><use href="#ic-globe"/></svg>
          </div>
          <h2 class="card-title">Platforms</h2>
        </div>
        <p class="field-hint" style="margin-bottom:14px">
          LearnLoop appears on these sites when a captioned video is detected.
          YouTube is always active.
        </p>

        <div id="default-platforms"></div>
        <div id="custom-platforms"></div>

        <div class="field" style="margin-top:14px">
          <label for="add-site-input">Add a site</label>
          <div class="add-site-row">
            <input type="text" id="add-site-input" placeholder="e.g. egghead.io" autocomplete="off">
            <button class="btn-add-site" id="add-site-btn" type="button">Add</button>
          </div>
          <p class="field-error" id="add-site-error"></p>
        </div>
      </section>

```

- [ ] **Step 3: Commit**

```bash
git add options/index.html
git commit -m "feat: add Platforms card HTML to options page"
```

---

## Task 5: Options page CSS — Platform styles

**Files:**
- Modify: `options/options.css`

- [ ] **Step 1: Append the new styles at the end of `options/options.css`**

Add this block at the very end of the file:

```css
/* ── Platforms card ── */
.platform-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.platform-row:last-child { border-bottom: none; }

.platform-info { flex: 1; min-width: 0; }

.platform-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.platform-host {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'SF Mono', 'Fira Code', 'Fira Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-remove-platform {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  background: none;
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  flex-shrink: 0;
  font-size: 15px;
  line-height: 1;
}
.btn-remove-platform:hover {
  background: rgba(248, 113, 113, 0.12);
  color: var(--error);
  border-color: var(--error);
}

/* Add-site row */
.add-site-row {
  display: flex;
  gap: 8px;
}
.add-site-row input { flex: 1; }

.btn-add-site {
  background: var(--accent-surf);
  color: var(--accent-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  padding: 9px 16px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  font-family: inherit;
}
.btn-add-site:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.field-error {
  font-size: 12px;
  color: var(--error);
  margin-top: 6px;
  min-height: 16px;
}
```

- [ ] **Step 2: Commit**

```bash
git add options/options.css
git commit -m "feat: add platform row and add-site styles to options page"
```

---

## Task 6: Options page JS — Platform config

**Files:**
- Modify: `options/options.js`

- [ ] **Step 1: Add platform constants and helpers after the existing `DEFAULTS` block**

In `options/options.js`, find the line:
```js
const DEFAULTS = {
```

Add this block **before** that line:

```js
// ── Platform config ───────────────────────────────────────────────────────
const DEFAULT_PLATFORM_LIST = [
  { name: 'Udemy',             host: 'www.udemy.com' },
  { name: 'Coursera',          host: 'www.coursera.org' },
  { name: 'LinkedIn Learning', host: 'www.linkedin.com/learning/' },
  { name: 'Khan Academy',      host: 'www.khanacademy.org' },
  { name: 'Pluralsight',       host: 'app.pluralsight.com' },
];

// Current enabled list (in memory, synced with storage)
let enabledPlatforms = DEFAULT_PLATFORM_LIST.map(p => p.host);

async function savePlatformConfig() {
  await chrome.storage.local.set({ platformConfig: { enabled: enabledPlatforms } });
}

function renderPlatformRow(container, name, host, isCustom) {
  const row = document.createElement('div');
  row.className    = 'platform-row';
  row.dataset.host = host;

  const info = document.createElement('div');
  info.className   = 'platform-info';
  info.innerHTML   =
    `<div class="platform-name">${name}</div>
     <div class="platform-host">${host}</div>`;

  // Toggle switch (reuse the same HTML pattern as auto-start)
  const switchLabel = document.createElement('label');
  switchLabel.className = 'switch';
  const checkbox = document.createElement('input');
  checkbox.type    = 'checkbox';
  checkbox.checked = enabledPlatforms.includes(host);
  checkbox.addEventListener('change', async () => {
    if (checkbox.checked) {
      if (!enabledPlatforms.includes(host)) enabledPlatforms.push(host);
    } else {
      enabledPlatforms = enabledPlatforms.filter(h => h !== host);
    }
    await savePlatformConfig();
  });
  const track = document.createElement('span');
  track.className  = 'track';
  track.innerHTML  = '<span class="thumb"></span>';
  switchLabel.append(checkbox, track);

  row.append(info, switchLabel);

  if (isCustom) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-platform';
    removeBtn.title     = 'Remove';
    removeBtn.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            style="width:13px;height:13px">
         <line x1="18" y1="6" x2="6" y2="18"/>
         <line x1="6" y1="6" x2="18" y2="18"/>
       </svg>`;
    removeBtn.addEventListener('click', async () => {
      enabledPlatforms = enabledPlatforms.filter(h => h !== host);
      await savePlatformConfig();
      row.remove();
    });
    row.append(removeBtn);
  }

  container.appendChild(row);
}

function renderAllPlatforms() {
  const defaultContainer = document.getElementById('default-platforms');
  const customContainer  = document.getElementById('custom-platforms');
  defaultContainer.innerHTML = '';
  customContainer.innerHTML  = '';

  // Render the five defaults
  DEFAULT_PLATFORM_LIST.forEach(({ name, host }) => {
    renderPlatformRow(defaultContainer, name, host, false);
  });

  // Render any custom entries (ones not in the default list)
  const defaultHosts = DEFAULT_PLATFORM_LIST.map(p => p.host);
  enabledPlatforms
    .filter(h => !defaultHosts.includes(h))
    .forEach(h => renderPlatformRow(customContainer, h, h, true));
}

function setupAddSite() {
  const input    = document.getElementById('add-site-input');
  const btn      = document.getElementById('add-site-btn');
  const errorEl  = document.getElementById('add-site-error');

  btn.addEventListener('click', async () => {
    errorEl.textContent = '';
    // Normalise: strip protocol and trailing slashes
    let raw = input.value.trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');

    if (!raw || !/^[a-z0-9][a-z0-9\-\.]+\.[a-z]{2,}/i.test(raw)) {
      errorEl.textContent = 'Enter a valid hostname (e.g. egghead.io)';
      return;
    }

    const host = raw.toLowerCase();
    const allKnown = [
      ...DEFAULT_PLATFORM_LIST.map(p => p.host),
      ...enabledPlatforms,
    ];
    if (allKnown.includes(host)) {
      errorEl.textContent = 'Already in the list.';
      return;
    }

    enabledPlatforms.push(host);
    await savePlatformConfig();
    renderPlatformRow(document.getElementById('custom-platforms'), host, host, true);
    input.value = '';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') btn.click();
  });
}

async function loadPlatforms() {
  const stored = await chrome.storage.local.get('platformConfig');
  // If no config stored yet, write the defaults
  if (!stored.platformConfig) {
    enabledPlatforms = DEFAULT_PLATFORM_LIST.map(p => p.host);
    await savePlatformConfig();
  } else {
    enabledPlatforms = stored.platformConfig.enabled ?? DEFAULT_PLATFORM_LIST.map(p => p.host);
  }
  renderAllPlatforms();
  setupAddSite();
}

```

- [ ] **Step 2: Update the `load()` function to also load platforms**

Find the existing `load()` function:
```js
async function load() {
  const stored = await chrome.storage.local.get('llmConfig');
```

Change it to:
```js
async function load() {
  const stored = await chrome.storage.local.get('llmConfig');
  await loadPlatforms();
```

Add `await loadPlatforms();` as the **first** line inside `load()`, right after the `const stored` line — so both run in parallel is fine but sequential is also fine since loadPlatforms has its own storage read.

Actually, place it **after** all the existing `document.getElementById` calls in `load()`, just before the closing `}`:

```js
async function load() {
  const stored = await chrome.storage.local.get('llmConfig');
  const cfg    = { ...DEFAULTS, ...(stored.llmConfig || {}) };

  document.getElementById('provider').value   = cfg.provider;
  document.getElementById('api-key').value    = cfg.apiKey || '';
  document.getElementById('model').value      = cfg.model  || '';
  document.getElementById('difficulty').value = cfg.difficulty || 'medium';
  autoStartEl.checked = !!cfg.autoStart;
  selectPill(cfg.minWatchPct ?? 0);
  syncMinWatchVisibility();
  await loadPlatforms();   // ← add this line
}
```

- [ ] **Step 3: Commit**

```bash
git add options/options.js
git commit -m "feat: platform config load/save/render in options page"
```

---

## Task 7: Manual verification

No automated test runner is set up for Chrome extensions. Verify each scenario manually after reloading the extension at `chrome://extensions` (toggle the developer switch, click "Reload").

- [ ] **Step 1: Reload the extension**

Go to `chrome://extensions`, find LearnLoop, click the reload (↺) button.

- [ ] **Step 2: Verify options page renders correctly**

Open LearnLoop settings (`chrome://extensions` → LearnLoop → Details → Extension options).

Expected:
- A "Platforms" card appears between Quiz and Auto-Start
- Five toggle rows (Udemy, Coursera, LinkedIn Learning, Khan Academy, Pluralsight) all toggled ON
- An "Add a site" input and button below them
- No console errors

- [ ] **Step 3: Verify custom site add/remove**

In the "Add a site" input:
1. Type `egghead.io` → click Add → row appears in custom list → no error
2. Type `not a domain` → click Add → error "Enter a valid hostname" appears → no row added
3. Type `egghead.io` again → click Add → error "Already in the list."
4. Click the × button on the egghead.io row → row disappears
5. Open DevTools → Console → run: `chrome.storage.local.get('platformConfig', console.log)` → `enabled` array matches the current toggle states

- [ ] **Step 4: Verify generic script guard on non-learning site**

Navigate to `https://github.com`. Open DevTools Console. Run:
```js
document.getElementById('__ll_start_btn')
```
Expected: `null` — no button injected (GitHub is not in the allow-list).

- [ ] **Step 5: Verify button appears on a platform with captions**

Navigate to any Udemy course lecture that has captions enabled, or any Coursera video. Wait up to 8 seconds.

Expected:
- The "Start LearnLoop" button appears (bottom-right, purple gradient pill)
- Clicking it shows the spinner, then opens the side panel with a quiz

If the platform doesn't have a `<track>` element visible (some players load it dynamically after user action), click the captions/subtitles button in the video player first, then reload.

- [ ] **Step 6: Verify toggling a platform off removes the button**

1. In options, toggle Udemy OFF → save
2. Reload the Udemy lecture page
3. Expected: no "Start LearnLoop" button

- [ ] **Step 7: Verify YouTube is unaffected**

Navigate to any YouTube video.
Expected: the existing button behaviour is unchanged — the generic script does NOT inject anything on YouTube (excluded in manifest).

- [ ] **Step 8: Final commit if any minor fixes were made during verification**

```bash
git add -p   # stage only intentional changes
git commit -m "fix: corrections from manual verification"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Allow-list guard: `isAllowed()` in generic.js
- ✅ Default platforms (5): `DEFAULT_PLATFORM_LIST` in options.js and `DEFAULT_PLATFORMS` in generic.js
- ✅ Matching logic `hostname + pathname startsWith entry`: `isAllowed()` uses `location.hostname + location.pathname`
- ✅ Video + track detection with 8s timeout: `startDetection()` + `detectTimer`
- ✅ Track priority (EN captions > any captions > EN subtitles > any subtitles): `getBestTrack()`
- ✅ SPA navigation: `startNavWatcher()` with `popstate` + 500ms interval, paused when hidden
- ✅ Button style matches YouTube button: identical `injectStartButton()` code
- ✅ VTT fetch with background fallback: `fetchVTT()`
- ✅ VTT parser (all 9 steps from spec): `parseVTT()` + `parseTimestamp()`
- ✅ FETCH_VTT handler in background.js: Task 2
- ✅ manifest.json content script entry + exclude_matches: Task 3
- ✅ optional_host_permissions: Task 3
- ✅ Platforms card in options HTML: Task 4
- ✅ Platform row styles: Task 5
- ✅ loadPlatforms / savePlatformConfig / renderAllPlatforms: Task 6
- ✅ Custom site add (validation, normalise, dedupe): `setupAddSite()`
- ✅ Custom site remove: remove button in `renderPlatformRow()`
- ✅ Platform toggles update storage immediately (no Save button needed): `checkbox.addEventListener('change', ...)`
- ✅ Error states (no track, fetch fail, context invalidated): all handled in `triggerSession()`
- ✅ `load()` in options.js calls `loadPlatforms()`: Task 6 Step 2
