// content/vtt-page-world.js — Runs in the PAGE's JavaScript world (not the extension).
// Injected via <script src="chrome-extension://..."> by vtt-interceptor.js so it
// bypasses Udemy's CSP (which allows chrome-extension:// origins).
// Wraps fetch + XHR to capture any .vtt response and post it back to the content script.
(function () {
  var pat = /\.vtt(\?|$|#)/i;

  // ── Wrap window.fetch ──────────────────────────────────────────────────────
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

  // ── Wrap XMLHttpRequest ────────────────────────────────────────────────────
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
})();
