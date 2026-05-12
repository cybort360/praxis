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
    el.innerHTML = '';

    const items = [
      { icon: 'ic-flame',  color: '#f97316', value: s.currentStreak, label: 'Day Streak'  },
      { icon: 'ic-medal',  color: '#eab308', value: s.longestStreak, label: 'Best Streak' },
      { icon: 'ic-layers', color: '#7c6af7', value: s.totalSessions, label: 'Sessions'    },
    ];

    items.forEach(({ icon, color, value, label }) => {
      const stat = document.createElement('div');
      stat.className = 'stat-item';

      const wrap = document.createElement('div');
      wrap.className = 'stat-icon-wrap';
      wrap.style.color = color;
      wrap.innerHTML = `<svg class="icon icon-sm" aria-hidden="true"><use href="#${icon}"/></svg>`;

      const num = document.createElement('div');
      num.className = 'stat-number';
      num.textContent = value;

      const lbl = document.createElement('div');
      lbl.className = 'stat-label';
      lbl.textContent = label;

      stat.appendChild(wrap);
      stat.appendChild(num);
      stat.appendChild(lbl);
      el.appendChild(stat);
    });
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

  async function renderHistory() {
    const list      = await loadHistory();
    const container = document.getElementById('history-list');
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML =
        '<p class="history-empty">No sessions yet — complete a video to see your history here.</p>';
      return;
    }

    list.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const body = document.createElement('div');
      body.className = 'history-card-body';

      const titleEl = document.createElement('p');
      titleEl.className = 'history-title';
      titleEl.textContent = entry.videoTitle;

      const metaEl = document.createElement('p');
      metaEl.className = 'history-meta';
      metaEl.textContent = `${entry.platform} · ${timeAgo(entry.date)}`;

      body.appendChild(titleEl);
      body.appendChild(metaEl);

      const expand = document.createElement('div');
      expand.className = 'history-expand hidden';

      const summaryEl = document.createElement('p');
      summaryEl.className = 'history-summary-text';
      summaryEl.textContent = entry.summary || '—';

      const kpList = document.createElement('ul');
      kpList.className = 'history-key-points';
      (entry.keyPoints || []).forEach(point => {
        const li = document.createElement('li');
        li.textContent = point;
        kpList.appendChild(li);
      });

      expand.appendChild(summaryEl);
      expand.appendChild(kpList);

      body.addEventListener('click', () => {
        expand.classList.toggle('hidden');
        card.classList.toggle('expanded');
      });

      card.appendChild(body);
      card.appendChild(expand);
      container.appendChild(card);
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
