// content/content.js — Injected into YouTube pages
(function () {
  'use strict';

  let lastVideoId = null;
  let sessionStarted = false;
  let startButton = null;
  let videoTimeListener = null;
  let isTriggering = false;

  const observer = new MutationObserver(() => {
    const videoId = getVideoId();
    if (videoId && videoId !== lastVideoId) {
      lastVideoId = videoId;
      sessionStarted = false;
      isTriggering = false;
      teardown();
      onNewVideo(videoId);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  const initialId = getVideoId();
  if (initialId) onNewVideo(initialId);

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
    if (startButton) {
      startButton.remove();
      startButton = null;
    }
    const video = document.querySelector('video');
    if (video && videoTimeListener) {
      video.removeEventListener('timeupdate', videoTimeListener);
      videoTimeListener = null;
    }
  }

  async function onNewVideo(videoId) {
    if (sessionStarted) return;
    await sleep(2000);
    injectStartButton(videoId);
    setupWatchGate(videoId);
  }

  function injectStartButton(videoId) {
    startButton = document.createElement('button');
    startButton.id = '__ll_start_btn';
    startButton.textContent = '▶ Start LearnLoop';
    Object.assign(startButton.style, {
      position: 'fixed',
      bottom: '80px',
      right: '20px',
      zIndex: '9999',
      background: '#7c3aed',
      color: '#fff',
      border: 'none',
      borderRadius: '9999px',
      padding: '10px 18px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    });
    startButton.addEventListener('click', () => triggerSession(videoId));
    document.body.appendChild(startButton);
  }

  function setupWatchGate(videoId) {
    const video = document.querySelector('video');
    if (!video) return;
    videoTimeListener = () => {
      if (video.duration && video.currentTime / video.duration >= 0.3) {
        triggerSession(videoId);
      }
    };
    video.addEventListener('timeupdate', videoTimeListener);
  }

  async function triggerSession(videoId) {
    if (isTriggering || sessionStarted) return;
    isTriggering = true;
    teardown();

    const title = getVideoTitle();
    let transcript = null;
    try {
      transcript = await fetchTranscript(videoId);
    } catch (e) {
      console.warn('[LearnLoop] Could not fetch transcript:', e.message);
      isTriggering = false;
      return;
    }

    sessionStarted = true;
    chrome.runtime.sendMessage({
      type: 'VIDEO_DETECTED',
      payload: { videoId, title, transcript },
    });
  }

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
