// popup/popup.js — Load and save AI provider settings

const providerEl = document.getElementById('provider');
const apiKeyEl = document.getElementById('api-key');
const modelEl = document.getElementById('model');
const statusEl = document.getElementById('status');

// Load saved config on open
chrome.storage.local.get('llmConfig', ({ llmConfig }) => {
  if (!llmConfig) return;
  providerEl.value = llmConfig.provider || 'anthropic';
  apiKeyEl.value = llmConfig.apiKey || '';
  modelEl.value = llmConfig.model || '';
});

document.getElementById('btn-save').addEventListener('click', () => {
  const provider = providerEl.value;
  const apiKey = apiKeyEl.value.trim();
  const model = modelEl.value.trim();

  if (!apiKey) {
    statusEl.style.color = '#e05c5c';
    statusEl.textContent = 'API key is required.';
    return;
  }

  const config = { provider, apiKey };
  if (model) config.model = model;

  chrome.storage.local.set({ llmConfig: config }, () => {
    statusEl.style.color = '#3dba77';
    statusEl.textContent = 'Saved!';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  });
});
