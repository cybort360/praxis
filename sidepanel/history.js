// sidepanel/history.js — Session history module
// Exposes the History global. Loaded before main.js in index.html.

const History = (() => {
  const KEY       = 'praxisHistory';
  const STATS_KEY = 'praxisStats';
  const MAX = 50;

  function inferPlatform(url) {
    try {
      const host = new URL(url).hostname;
      if (host.includes('youtube.com'))    return 'YouTube';
      if (host.includes('udemy.com'))      return 'Udemy';
      if (host.includes('coursera.org'))   return 'Coursera';
      if (host.includes('linkedin.com'))   return 'LinkedIn Learning';
      if (host.includes('khanacademy.org')) return 'Khan Academy';
      if (host.includes('pluralsight.com')) return 'Pluralsight';
      return host.replace(/^www\./, '');
    } catch (_) {
      return 'Unknown';
    }
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 2)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7)   return `${days} days ago`;
    return new Date(ts).toLocaleDateString();
  }

  // ── Stats helpers ─────────────────────────────────────────────────────────

  function _dateKey(ts) {
    return new Date(ts).toISOString().split('T')[0]; // "YYYY-MM-DD"
  }

  async function _updateStats() {
    try {
      const today   = _dateKey(Date.now());
      const stored  = await chrome.storage.local.get(STATS_KEY);
      const s = stored[STATS_KEY] || {
        totalSessions:   0,
        currentStreak:   0,
        longestStreak:   0,
        lastSessionDate: null,
      };

      s.totalSessions++;

      if (!s.lastSessionDate) {
        s.currentStreak = 1;
      } else if (s.lastSessionDate === today) {
        // Multiple sessions in one day — streak already counted, just bump total
      } else {
        const yesterday = _dateKey(Date.now() - 86_400_000);
        s.currentStreak = (s.lastSessionDate === yesterday) ? s.currentStreak + 1 : 1;
      }

      s.longestStreak   = Math.max(s.longestStreak, s.currentStreak);
      s.lastSessionDate = today;

      await chrome.storage.local.set({ [STATS_KEY]: s });
    } catch (e) {
      console.error('[Praxis] History._updateStats failed:', e);
    }
  }

  async function loadStats() {
    try {
      const stored = await chrome.storage.local.get(STATS_KEY);
      return stored[STATS_KEY] || {
        totalSessions: 0, currentStreak: 0, longestStreak: 0, lastSessionDate: null,
      };
    } catch (e) {
      console.error('[Praxis] History.loadStats failed:', e);
      return { totalSessions: 0, currentStreak: 0, longestStreak: 0, lastSessionDate: null };
    }
  }

  async function renderStats() {
    const s  = await loadStats();
    const el = document.getElementById('history-stats');
    if (!el) return;

    el.innerHTML = `
      <div class="history-stats-hero">
        <div class="history-streak-card">
          <div class="history-streak-icon">
            <svg class="icon" style="width:30px;height:30px" aria-hidden="true"><use href="#ic-flame"/></svg>
          </div>
          <div class="history-streak-number">${s.currentStreak}</div>
          <div class="history-streak-label">Day Streak</div>
        </div>
        <div class="history-mini-stats">
          <div class="history-mini-stat">
            <div class="history-mini-stat-icon" style="color:#eab308">
              <svg class="icon icon-sm" aria-hidden="true"><use href="#ic-medal"/></svg>
            </div>
            <span class="history-mini-stat-value">${s.longestStreak}</span>
            <span class="history-mini-stat-label">Best</span>
          </div>
          <div class="history-mini-stat">
            <div class="history-mini-stat-icon" style="color:#7c6af7">
              <svg class="icon icon-sm" aria-hidden="true"><use href="#ic-layers"/></svg>
            </div>
            <span class="history-mini-stat-value">${s.totalSessions}</span>
            <span class="history-mini-stat-label">Sessions</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Session storage ───────────────────────────────────────────────────────

  async function saveSession(data) {
    try {
      const stored = await chrome.storage.local.get(KEY);
      const list   = stored[KEY] || [];
      list.unshift({
        id:             String(Date.now()),
        videoTitle:     data.videoTitle || 'Untitled',
        platform:       inferPlatform(data.url || ''),
        url:            data.url || '',
        date:           Date.now(),
        quizScore:      null,
        quizTotal:      null,
        challengePassed: null,
        summary:        data.summary?.summary   || '',
        keyPoints:      data.summary?.keyPoints || [],
      });
      if (list.length > MAX) list.length = MAX;
      await chrome.storage.local.set({ [KEY]: list });
      await _updateStats();
      // Enable the history toolbar icon now that there is at least one entry
      const histBtn = document.getElementById('btn-history');
      histBtn.style.opacity = '';
      histBtn.style.pointerEvents = '';
    } catch (e) {
      console.error('[Praxis] History.saveSession failed:', e);
    }
  }

  async function loadHistory() {
    try {
      const stored = await chrome.storage.local.get(KEY);
      return stored[KEY] || [];
    } catch (e) {
      console.error('[Praxis] History.loadHistory failed:', e);
      return [];
    }
  }

  function _groupByDate(list) {
    const today     = _dateKey(Date.now());
    const yesterday = _dateKey(Date.now() - 86_400_000);
    const groups    = new Map();
    list.forEach(entry => {
      const key = _dateKey(entry.date);
      let label;
      if (key === today)          label = 'Today';
      else if (key === yesterday) label = 'Yesterday';
      else {
        label = new Date(entry.date).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        });
      }
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(entry);
    });
    return groups;
  }

  function _escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // SVG micro-icons inlined so they work inside innerHTML without sprite lookup
  const _svgCheck = `<svg style="width:9px;height:9px;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
  const _svgX     = `<svg style="width:9px;height:9px;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  const _svgExt   = `<svg style="width:10px;height:10px;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

  async function renderHistory() {
    const list      = await loadHistory();
    const container = document.getElementById('history-list');
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = `
        <div class="history-empty">
          <div class="history-empty-icon">
            <svg class="icon icon-md" aria-hidden="true"><use href="#ic-layers"/></svg>
          </div>
          <p class="history-empty-title">Nothing here yet</p>
          <p class="history-empty-sub">Complete a learning session and your history will appear here.</p>
        </div>`;
      return;
    }

    const groups = _groupByDate(list);

    groups.forEach((entries, label) => {
      // Section date label
      const sec = document.createElement('p');
      sec.className = 'history-section-label';
      sec.textContent = label;
      container.appendChild(sec);

      entries.forEach(entry => {
        // ── Accent class ──────────────────────────────────────────────────
        let accentClass = 'ha-muted';
        if (entry.challengePassed === true) {
          accentClass = 'ha-green';
        } else if (entry.quizScore !== null && entry.quizTotal) {
          accentClass = (entry.quizScore / entry.quizTotal) >= 0.6 ? 'ha-amber' : 'ha-muted';
        } else if (entry.summary) {
          accentClass = 'ha-purple';
        }

        // ── Quiz pill ─────────────────────────────────────────────────────
        let quizPill = '';
        if (entry.quizScore !== null && entry.quizTotal) {
          const pct = entry.quizScore / entry.quizTotal;
          const cls = pct >= 0.8 ? 'h-pill-pass' : pct >= 0.5 ? 'h-pill-partial' : 'h-pill-fail';
          const ico = pct >= 0.5 ? _svgCheck : _svgX;
          quizPill = `<span class="h-pill ${cls}">${ico} ${entry.quizScore}/${entry.quizTotal}</span>`;
        }

        // ── Challenge pill ────────────────────────────────────────────────
        let builtPill = '';
        if (entry.challengePassed === true) {
          builtPill = `<span class="h-pill h-pill-built">${_svgCheck} Built</span>`;
        }

        // ── Expand: summary + key points + rewatch ────────────────────────
        const hasSummary = entry.summary || (entry.keyPoints && entry.keyPoints.length > 0);
        let expandHTML = '';
        if (hasSummary) {
          const summaryHTML = entry.summary
            ? `<p class="history-expand-label">Summary</p>
               <p class="history-summary-text">${_escHtml(entry.summary)}</p>`
            : '';

          const kpItems = (entry.keyPoints || []).slice(0, 5)
            .map(p => `<li>${_escHtml(p)}</li>`)
            .join('');
          const kpHTML = kpItems
            ? `<p class="history-expand-label">Key Points</p>
               <ul class="history-key-points">${kpItems}</ul>`
            : '';

          const footerHTML = entry.url
            ? `<div class="history-expand-footer">
                 <a class="history-rewatch-link" href="${_escHtml(entry.url)}" target="_blank">
                   Rewatch ${_svgExt}
                 </a>
               </div>`
            : '';

          expandHTML = `
            <div class="history-expand hidden">
              ${summaryHTML}
              ${kpHTML}
              ${footerHTML}
            </div>`;
        }

        // ── Assemble card ─────────────────────────────────────────────────
        const card = document.createElement('div');
        card.className = `history-card ${accentClass}`;
        card.innerHTML = `
          <div class="history-card-body">
            <div class="history-card-top">
              <p class="history-title">${_escHtml(entry.videoTitle)}</p>
              <span class="history-time">${timeAgo(entry.date)}</span>
            </div>
            <div class="history-card-pills">
              <span class="h-pill h-pill-platform">${_escHtml(entry.platform)}</span>
              ${quizPill}
              ${builtPill}
            </div>
          </div>
          ${expandHTML}`;

        if (hasSummary) {
          card.querySelector('.history-card-body').addEventListener('click', () => {
            card.querySelector('.history-expand').classList.toggle('hidden');
            card.classList.toggle('expanded');
          });
        }

        container.appendChild(card);
      });
    });
  }

  async function clearHistory() {
    try {
      await chrome.storage.local.remove(KEY);
      document.getElementById('history-list').innerHTML =
        '<p class="history-empty">No sessions yet — complete a video to see your history here.</p>';
      const histBtn = document.getElementById('btn-history');
      histBtn.style.opacity = '0.35';
      histBtn.style.pointerEvents = 'none';
    } catch (e) {
      console.error('[Praxis] History.clearHistory failed:', e);
    }
  }

  return { saveSession, loadHistory, renderHistory, clearHistory, loadStats, renderStats };
})();
