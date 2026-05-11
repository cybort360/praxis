// content/content.js — Injected into YouTube pages
(function () {
  'use strict';

  let lastVideoId    = null;
  let sessionStarted = false;
  let startButton    = null;
  let isTriggering   = false;

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

  // ── Teardown / stop ───────────────────────────────────────────────────────
  function teardown() {
    if (startButton) { startButton.remove(); startButton = null; }
  }

  let observerActive = false;
  function stopAll() {
    if (observerActive) { observer.disconnect(); observerActive = false; }
    teardown();
  }

  // ── Navigation: YouTube SPA events (primary) ──────────────────────────────
  // yt-navigate-start fires the instant the user clicks a new video link —
  // remove the old button right away so it doesn't linger.
  window.addEventListener('yt-navigate-start', () => {
    teardown();
    sessionStarted = false;
    isTriggering   = false;
  });

  // yt-navigate-finish fires when the new page is fully ready.
  // Use a short delay (300 ms) because the player is already initialised.
  window.addEventListener('yt-navigate-finish', () => {
    if (!isContextAlive()) return;
    const videoId = getVideoId();
    if (!videoId || videoId === lastVideoId) return;
    lastVideoId = videoId;
    onNewVideo(videoId, /* fast= */ true);
  });

  // ── Navigation: MutationObserver (fallback for edge cases) ────────────────
  // Catches navigations that don't fire yt-navigate-finish (e.g. playlist
  // autoplay, certain embed scenarios).
  const observer = new MutationObserver(() => {
    if (!isContextAlive()) { stopAll(); return; }
    const videoId = getVideoId();
    if (videoId && videoId !== lastVideoId) {
      lastVideoId    = videoId;
      sessionStarted = false;
      isTriggering   = false;
      teardown();
      // MutationObserver fires many times during page load; use normal delay.
      onNewVideo(videoId, /* fast= */ false);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  observerActive = true;

  // ── Initial load ──────────────────────────────────────────────────────────
  const initialId = getVideoId();
  if (initialId) {
    lastVideoId = initialId;
    onNewVideo(initialId, /* fast= */ false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getVideoId() {
    return new URLSearchParams(window.location.search).get('v') || null;
  }

  function getVideoTitle() {
    return (
      document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')?.textContent?.trim() ||
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() ||
      document.title.replace(' - YouTube', '').trim()
    );
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function showToast(msg, color = '#e05c5c') {
    const tip = document.createElement('div');
    tip.textContent = msg;
    Object.assign(tip.style, {
      position: 'fixed', bottom: '130px', right: '20px', zIndex: '10000',
      background: '#1a1a22', color, border: `1px solid ${color}`,
      borderRadius: '8px', padding: '8px 12px', fontSize: '12px',
      maxWidth: '240px', lineHeight: '1.4', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    });
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 4000);
  }

  // ── Core flow ─────────────────────────────────────────────────────────────
  // fast=true  → SPA navigation: player already exists, 300 ms is enough
  // fast=false → initial page load: wait 2 s for player to initialise
  async function onNewVideo(videoId, fast) {
    if (sessionStarted) return;
    await sleep(fast ? 300 : 2000);
    if (videoId !== lastVideoId) return;   // user navigated again during sleep
    if (!isContextAlive()) return;

    const stored = await safeChrome(() => chrome.storage.local.get('llmConfig'));
    if (stored === null) return;

    const cfg         = stored.llmConfig || {};
    const autoStart   = !!cfg.autoStart;
    const minWatchPct = typeof cfg.minWatchPct === 'number' ? cfg.minWatchPct : 0;
    const video       = document.querySelector('video');

    if (autoStart && video) {
      watchForAutoStart(video, videoId, minWatchPct);
    } else {
      injectStartButton(videoId);
    }
  }

  function watchForAutoStart(video, videoId, minWatchPct) {
    if (minWatchPct === 0) { triggerSession(videoId); return; }

    function onTimeUpdate() {
      if (!isContextAlive()) { video.removeEventListener('timeupdate', onTimeUpdate); return; }
      if (!video.duration) return;
      if ((video.currentTime / video.duration) * 100 >= minWatchPct) {
        video.removeEventListener('timeupdate', onTimeUpdate);
        triggerSession(videoId);
      }
    }
    video.addEventListener('timeupdate', onTimeUpdate);
  }

  // ── SVG icon helpers ──────────────────────────────────────────────────────
  // Returns an inline SVG string. SMIL animation is used for the spinner so
  // no injected <style> or keyframes are needed on YouTube's page.
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
         ${iconHtml}
         <span>${label}</span>
       </span>`;
  }

  function injectStartButton(videoId) {
    if (startButton) return;
    startButton = document.createElement('button');
    startButton.id = '__ll_start_btn';
    Object.assign(startButton.style, {
      position: 'fixed', bottom: '80px', right: '20px', zIndex: '9999',
      background: 'linear-gradient(135deg,#7c6af7,#a78bfa)',
      color: '#fff', border: 'none', borderRadius: '9999px',
      padding: '10px 20px', fontSize: '14px', fontWeight: '600',
      cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,106,247,0.5)',
      transition: 'opacity .15s, transform .1s',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      lineHeight: '1',
    });
    setButtonState('Start LearnLoop', iconPlay());
    startButton.onmouseenter = () => { startButton.style.opacity = '0.88'; startButton.style.transform = 'translateY(-1px)'; };
    startButton.onmouseleave = () => { startButton.style.opacity = '1';    startButton.style.transform = 'translateY(0)'; };
    startButton.addEventListener('click', () => {
      if (!isContextAlive()) {
        showToast('Extension was reloaded — please refresh the page.');
        return;
      }
      triggerSession(videoId);
    });
    document.body.appendChild(startButton);
  }

  async function triggerSession(videoId) {
    if (isTriggering || sessionStarted) return;
    if (!isContextAlive()) { showToast('Extension was reloaded — please refresh the page.'); return; }
    isTriggering = true;

    // Show spinner while fetching transcript
    setButtonState('Loading…', iconSpinner());

    let transcript = null;
    try {
      transcript = await fetchTranscript(videoId);
    } catch (e) {
      console.warn('[LearnLoop] Could not fetch transcript:', e.message);
      isTriggering = false;
      setButtonState('Start LearnLoop', iconPlay());
      showToast('No captions found — captions are required');
      return;
    }

    if (!isContextAlive()) return;

    teardown();
    sessionStarted = true;
    await safeChrome(() =>
      chrome.runtime.sendMessage({
        type:    'VIDEO_DETECTED',
        payload: { videoId, title: getVideoTitle(), transcript },
      })
    );
  }

  // ── Transcript fetching ───────────────────────────────────────────────────
  function getPlayerData() {
    return new Promise((resolve, reject) => {
      if (!isContextAlive()) { reject(new Error('Extension context invalidated')); return; }
      chrome.runtime.sendMessage({ type: 'GET_PLAYER_DATA' }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.ok) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error ?? 'Failed to get player data'));
        }
      });
    });
  }

  async function fetchTranscript(videoId) {
    const playerResponse = await getPlayerData();
    const captionTracks  =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks?.length) throw new Error('No caption tracks found');
    const track =
      captionTracks.find(t => t.languageCode === 'en') ||
      captionTracks.find(t => t.languageCode?.startsWith('en')) ||
      captionTracks[0];
    const xml = await (await fetch(track.baseUrl)).text();
    return parseTranscriptXML(xml);
  }

  function parseTranscriptXML(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return Array.from(doc.querySelectorAll('text'))
      .map(el => ({
        t:    parseFloat(el.getAttribute('start') || '0'),
        text: el.textContent.replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim(),
      }))
      .filter(seg => seg.text);
  }
})();
