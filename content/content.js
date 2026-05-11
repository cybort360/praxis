// content/content.js — Injected into YouTube pages
(function () {
  'use strict';

  let lastVideoId    = null;
  let sessionStarted = false;
  let startButton    = null;
  let isTriggering   = false;

  // ── Context guard ─────────────────────────────────────────────────────────
  // When the extension is reloaded/updated, the content script's chrome.*
  // access is severed. All chrome API calls must go through this wrapper.
  function isContextAlive() {
    try {
      // chrome.runtime.id throws / becomes undefined when context is gone
      return !!chrome.runtime?.id;
    } catch (_) {
      return false;
    }
  }

  // Wraps a chrome API call; silently returns null if context is invalidated.
  async function safeChrome(fn) {
    if (!isContextAlive()) return null;
    try {
      return await fn();
    } catch (e) {
      if (e.message?.includes('Extension context invalidated') ||
          e.message?.includes('context invalidated')) {
        stopObserver();
        return null;
      }
      throw e;
    }
  }

  // ── Navigation observer ───────────────────────────────────────────────────
  let observerActive = false;
  const observer = new MutationObserver(() => {
    if (!isContextAlive()) { stopObserver(); return; }
    const videoId = getVideoId();
    if (videoId && videoId !== lastVideoId) {
      lastVideoId    = videoId;
      sessionStarted = false;
      isTriggering   = false;
      teardown();
      onNewVideo(videoId);
    }
  });

  function stopObserver() {
    if (observerActive) {
      observer.disconnect();
      observerActive = false;
    }
    teardown();
  }

  observer.observe(document.body, { childList: true, subtree: true });
  observerActive = true;

  const initialId = getVideoId();
  if (initialId) onNewVideo(initialId);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v') || null;
  }

  function getVideoTitle() {
    return (
      document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')?.textContent?.trim() ||
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() ||
      document.title.replace(' - YouTube', '').trim()
    );
  }

  function teardown() {
    if (startButton) { startButton.remove(); startButton = null; }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function showButtonError(msg) {
    const tip = document.createElement('div');
    tip.textContent = msg;
    Object.assign(tip.style, {
      position: 'fixed', bottom: '130px', right: '20px', zIndex: '10000',
      background: '#1a1a22', color: '#e05c5c', border: '1px solid #e05c5c',
      borderRadius: '8px', padding: '8px 12px', fontSize: '12px',
      maxWidth: '220px', lineHeight: '1.4', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    });
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 4000);
  }

  // ── Core flow ─────────────────────────────────────────────────────────────
  async function onNewVideo(videoId) {
    if (sessionStarted) return;
    await sleep(2000);
    if (videoId !== lastVideoId) return;          // navigated away during sleep
    if (!isContextAlive()) return;                // extension was reloaded

    const stored = await safeChrome(() => chrome.storage.local.get('llmConfig'));
    if (stored === null) return;                  // context gone

    const cfg         = stored.llmConfig || {};
    const autoStart   = !!cfg.autoStart;
    const minWatchPct = typeof cfg.minWatchPct === 'number' ? cfg.minWatchPct : 0;
    const video       = document.querySelector('video');

    if (autoStart) {
      if (video) {
        watchForAutoStart(video, videoId, minWatchPct);
      } else {
        injectStartButton(videoId);
      }
    } else {
      injectStartButton(videoId);
    }
  }

  function watchForAutoStart(video, videoId, minWatchPct) {
    if (minWatchPct === 0) {
      triggerSession(videoId);
      return;
    }

    function onTimeUpdate() {
      if (!isContextAlive()) { video.removeEventListener('timeupdate', onTimeUpdate); return; }
      if (!video.duration || video.duration === 0) return;
      const pct = (video.currentTime / video.duration) * 100;
      if (pct >= minWatchPct) {
        video.removeEventListener('timeupdate', onTimeUpdate);
        triggerSession(videoId);
      }
    }

    video.addEventListener('timeupdate', onTimeUpdate);
  }

  function injectStartButton(videoId) {
    if (startButton) return;
    startButton = document.createElement('button');
    startButton.id = '__ll_start_btn';
    startButton.textContent = '▶ Start LearnLoop';
    Object.assign(startButton.style, {
      position: 'fixed', bottom: '80px', right: '20px', zIndex: '9999',
      background: '#7c3aed', color: '#fff', border: 'none',
      borderRadius: '9999px', padding: '10px 18px', fontSize: '14px',
      fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    });
    startButton.addEventListener('click', () => {
      if (!isContextAlive()) {
        showButtonError('Extension was reloaded — please refresh the page.');
        return;
      }
      triggerSession(videoId);
    });
    document.body.appendChild(startButton);
  }

  async function triggerSession(videoId) {
    if (isTriggering || sessionStarted) return;
    if (!isContextAlive()) {
      showButtonError('Extension was reloaded — please refresh the page.');
      return;
    }
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

    if (!isContextAlive()) return;

    teardown();
    sessionStarted = true;
    await safeChrome(() =>
      chrome.runtime.sendMessage({
        type:    'VIDEO_DETECTED',
        payload: { videoId, title, transcript },
      })
    );
  }

  function getPlayerData() {
    return new Promise((resolve, reject) => {
      if (!isContextAlive()) { reject(new Error('Extension context invalidated')); return; }
      chrome.runtime.sendMessage({ type: 'GET_PLAYER_DATA' }, (response) => {
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
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error('No caption tracks found');
    }
    const track =
      captionTracks.find(t => t.languageCode === 'en') ||
      captionTracks.find(t => t.languageCode?.startsWith('en')) ||
      captionTracks[0];
    const transcriptRes = await fetch(track.baseUrl);
    const xml = await transcriptRes.text();
    return parseTranscriptXML(xml);
  }

  function parseTranscriptXML(xml) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'text/xml');
    return Array.from(doc.querySelectorAll('text'))
      .map(el => ({
        t:    parseFloat(el.getAttribute('start') || '0'),
        text: el.textContent.replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim(),
      }))
      .filter(seg => seg.text);
  }
})();
