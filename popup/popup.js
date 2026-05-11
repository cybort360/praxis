async function init() {
  const result = await chrome.storage.local.get('llmConfig');
  const cfg = result.llmConfig;

  const dotEl      = document.getElementById('status-dot');
  const providerEl = document.getElementById('status-provider');
  const modelEl    = document.getElementById('status-model');

  if (!cfg || !cfg.apiKey) {
    dotEl.classList.add('inactive');
    providerEl.textContent = 'Not configured';
    providerEl.style.color = 'var(--text-muted)';
    modelEl.textContent    = 'Open Settings →';
    modelEl.style.color    = 'var(--accent-2)';
  } else {
    dotEl.classList.remove('inactive');
    providerEl.textContent = cfg.provider || 'Unknown';
    providerEl.classList.add('highlight');
    modelEl.textContent    = cfg.model || 'Default model';
  }
}

document.getElementById('btn-panel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  } else {
    const providerEl = document.getElementById('status-provider');
    providerEl.textContent = 'No active tab found.';
  }
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

init();
