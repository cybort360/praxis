// content/vtt-interceptor.js — Runs at document_start (before the page's JS loads).
// Injects a tiny page-world script that wraps fetch + XHR to capture any .vtt file
// the video player downloads. Captured data is stored in window.__llVttList so that
// generic.js (which runs at document_idle) can read it on demand.
(function () {
  'use strict';

  // Shared with generic.js — both content scripts run in the same isolated world.
  window.__llVttList = [];

  // Receive VTT data posted from the page-world interceptor.
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    if (!e.data || e.data.__ll !== 'vtt' || !e.data.text) return;
    // Keep the 10 most-recent VTTs, newest first.
    window.__llVttList.unshift({ url: e.data.url, text: e.data.text });
    if (window.__llVttList.length > 10) window.__llVttList.length = 10;
  });

  // Inject vtt-page-world.js into the page's JavaScript world via an external
  // <script src> tag. Udemy's CSP blocks inline scripts but explicitly allows
  // chrome-extension:// origins, so this bypasses the restriction.
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/vtt-page-world.js');

  // Prepend before any page script runs.
  (document.head || document.documentElement).prepend(script);
  script.remove();
})();
