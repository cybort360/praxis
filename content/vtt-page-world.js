// content/vtt-page-world.js — Runs in the PAGE's JavaScript world.
// Injected via <script src="chrome-extension://..."> by vtt-interceptor.js.
// Wraps fetch + XHR to capture caption files before the video player processes them.
(function () {
  // Matches URLs that are obviously caption files by extension.
  var extPat = /\.(vtt|srt|sbv)(\?|$|#)/i;

  // Matches URLs that look like caption/subtitle API endpoints even without
  // a recognised extension (e.g. /api/v1/subtitles?lang=en).
  var apiPat = /(subtitle|caption|transcript|closed.?caption)/i;

  // Quick check that a response body looks like a real caption file.
  // Prevents false positives from API endpoints that return JSON/HTML.
  function looksLikeCaption(text) {
    if (!text || text.length < 10) return false;
    var t = text.trimLeft ? text.trimLeft() : text.replace(/^\s+/, '');
    // WebVTT
    if (t.indexOf('WEBVTT') === 0) return true;
    // SRT — starts with "1\n" or "1\r\n" followed by a timestamp
    if (/^1\r?\n\d\d:\d\d:\d\d[,.]/.test(t)) return true;
    return false;
  }

  function mayPost(url, text) {
    if (extPat.test(url)) return true;                    // obvious extension
    if (apiPat.test(url) && looksLikeCaption(text)) return true; // API + sniff
    return false;
  }

  // ── Wrap window.fetch ──────────────────────────────────────────────────────
  var _fetch = window.fetch;
  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var url  = typeof args[0] === 'string' ? args[0]
             : (args[0] && args[0].url)   ? args[0].url
             : '';
    var p = _fetch.apply(this, args);
    if (url) {
      // We can't inspect body without consuming the stream, so clone it.
      p.then(function (r) {
        // Only clone text responses — skip binary/non-text content types.
        var ct = r.headers && r.headers.get('content-type') || '';
        if (ct && ct.indexOf('text') === -1 && ct.indexOf('octet') === -1
            && !extPat.test(url)) return;
        return r.clone().text();
      }).then(function (text) {
        if (text && mayPost(url, text)) {
          window.postMessage({ __ll: 'vtt', url: url, text: text }, '*');
        }
      }).catch(function () {});
    }
    return p;
  };

  // ── Wrap XMLHttpRequest ────────────────────────────────────────────────────
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (extPat.test(url) || apiPat.test(url)) {
      var self = this;
      this.addEventListener('load', function () {
        var text = self.responseText;
        if (mayPost(url, text)) {
          window.postMessage({ __ll: 'vtt', url: url, text: text }, '*');
        }
      });
    }
    return _open.apply(this, arguments);
  };
})();
