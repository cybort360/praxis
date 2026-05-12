// sidepanel/history.js — Session history module
// Exposes the History global. Loaded before main.js in index.html.

const History = (() => {
  const KEY = 'praxisHistory';
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
      // Reveal the history toolbar icon now that there is at least one entry
      document.getElementById('btn-history').classList.remove('hidden');
    } catch (e) {
      console.error('[Praxis] History.saveSession failed:', e);
    }
  }

  async function loadHistory() {
    const stored = await chrome.storage.local.get(KEY);
    return stored[KEY] || [];
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
      body.innerHTML = `
        <p class="history-title">${entry.videoTitle}</p>
        <p class="history-meta">${entry.platform} · ${timeAgo(entry.date)}</p>
      `;

      const expand = document.createElement('div');
      expand.className = 'history-expand hidden';
      expand.innerHTML = `
        <p class="history-summary-text">${entry.summary || '—'}</p>
        <ul class="history-key-points">
          ${(entry.keyPoints || []).map(p => `<li>${p}</li>`).join('')}
        </ul>
      `;

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
    await chrome.storage.local.remove(KEY);
    document.getElementById('history-list').innerHTML =
      '<p class="history-empty">No sessions yet — complete a video to see your history here.</p>';
    document.getElementById('btn-history').classList.add('hidden');
  }

  return { saveSession, loadHistory, renderHistory, clearHistory };
})();
