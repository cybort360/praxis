// content/content.js — Injected into YouTube pages
// Detects video, extracts transcript, and notifies the background service worker.

(function () {
  'use strict';

  let lastVideoId = null;
  let sessionStarted = false;

  // ── Watch for YouTube navigation (YouTube is a SPA) ──
  const observer = new MutationObserver(() => {
    const videoId = getVideoId();
    if (videoId && videoId !== lastVideoId) {
      lastVideoId = videoId;
      sessionStarted = false;
      onNewVideo(videoId);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Also fire on first load
  const initialId = getVideoId();
  if (initialId) onNewVideo(initialId);

  // ── Helpers ──

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

  async function onNewVideo(videoId) {
    if (sessionStarted) return;

    // Small delay to let YouTube finish rendering the page
    await sleep(2000);

    const title = getVideoTitle();
    console.log(`[LearnLoop] Detected video: "${title}" (${videoId})`);

    // Try to get transcript — YouTube serves it as a timed text track
    let transcript = null;
    try {
      transcript = await fetchTranscript(videoId);
    } catch (e) {
      console.warn('[LearnLoop] Could not fetch transcript:', e.message);
    }

    if (!transcript) {
      console.log('[LearnLoop] No transcript available for this video.');
      return;
    }

    sessionStarted = true;

    chrome.runtime.sendMessage({
      type: 'VIDEO_DETECTED',
      payload: { videoId, title, transcript },
    });
  }

  // ── Transcript Fetcher ──
  // YouTube already has the parsed player data on window.ytInitialPlayerResponse.
  // We inject a tiny inline script to postMessage it into the content-script world,
  // avoiding a redundant page fetch and the brittle regex that breaks when YouTube
  // changes its HTML structure.

  function getPlayerData() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timeout waiting for ytInitialPlayerResponse')),
        5000
      );

      window.addEventListener('message', (e) => {
        if (e.data?.type === '__LL_PLAYER_DATA') {
          clearTimeout(timer);
          resolve(e.data.data);
        }
      }, { once: true });

      const script = document.createElement('script');
      script.textContent = `
        window.postMessage({ type: '__LL_PLAYER_DATA', data: window.ytInitialPlayerResponse }, '*');
      `;
      document.documentElement.appendChild(script);
      script.remove();
    });
  }

  async function fetchTranscript(videoId) {
    const playerResponse = await getPlayerData();

    const captionTracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      throw new Error('No caption tracks found');
    }

    // Prefer English
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
    const doc = parser.parseFromString(xml, 'text/xml');
    const texts = doc.querySelectorAll('text');

    return Array.from(texts)
      .map(el => el.textContent.replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim())
      .filter(Boolean)
      .join(' ');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
