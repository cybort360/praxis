async function init() {
  const result = await chrome.storage.local.get('llmConfig');
  const cfg = result.llmConfig;
  const statusEl = document.getElementById('status');

  if (!cfg || !cfg.apiKey) {
    statusEl.innerHTML = 'Not configured — <strong>open Settings</strong> to add your API key.';
  } else {
    const model = cfg.model || 'default model';
    statusEl.innerHTML = `<strong>${cfg.provider}</strong> · ${model}`;
  }
}

document.getElementById('btn-panel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
  window.close();
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

init();
