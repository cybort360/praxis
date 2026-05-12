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

  // Inject the interceptor into the page's JavaScript world.
  // Using ES5 inside the string so it is safe even in strict pages.
  const script = document.createElement('script');
  script.textContent = `(function () {
    var pat = /\\.vtt(\\?|$|#)/i;

    // ── Wrap window.fetch ────────────────────────────────────────────────────
    var _fetch = window.fetch;
    window.fetch = function () {
      var args = Array.prototype.slice.call(arguments);
      var url  = typeof args[0] === 'string' ? args[0]
               : (args[0] && args[0].url)   ? args[0].url
               : '';
      var p = _fetch.apply(this, args);
      if (url && pat.test(url)) {
        p.then(function (r) { return r.clone().text(); })
         .then(function (t) { window.postMessage({ __ll: 'vtt', url: url, text: t }, '*'); })
         .catch(function () {});
      }
      return p;
    };

    // ── Wrap XMLHttpRequest ──────────────────────────────────────────────────
    var _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (pat.test(url)) {
        var self = this;
        this.addEventListener('load', function () {
          window.postMessage({ __ll: 'vtt', url: url, text: self.responseText }, '*');
        });
      }
      return _open.apply(this, arguments);
    };
  })();`;

  // Prepend before any page script runs.
  (document.head || document.documentElement).prepend(script);
  script.remove();
})();
