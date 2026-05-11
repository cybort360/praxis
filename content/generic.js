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
