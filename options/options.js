const DEFAULTS = {
  provider: 'anthropic',
  apiKey: '',
  baseUrl: '',
  model: '',
  difficulty: 'medium',
  autoStart: false,
  minWatchPct: 0,
};

function showBaseUrl(provider) {
  document.getElementById('base-url-field').style.display =
    provider === 'openai-compatible' ? '' : 'none';
}

async function load() {
  const stored = await chrome.storage.local.get('llmConfig');
  const cfg = { ...DEFAULTS, ...(stored.llmConfig || {}) };

  document.getElementById('provider').value = cfg.provider;
  document.getElementById('api-key').value = cfg.apiKey || '';
  document.getElementById('base-url').value = cfg.baseUrl || '';
  document.getElementById('model').value = cfg.model || '';
  document.getElementById('difficulty').value = cfg.difficulty || 'medium';
  document.getElementById('auto-start').checked = !!cfg.autoStart;
  document.getElementById('min-watch').value = cfg.minWatchPct ?? 0;
  document.getElementById('min-watch-display').textContent = `${cfg.minWatchPct ?? 0}%`;

  showBaseUrl(cfg.provider);
}

async function save() {
  const provider = document.getElementById('provider').value;
  const apiKey = document.getElementById('api-key').value.trim();
  const baseUrl = document.getElementById('base-url').value.trim();
  const model = document.getElementById('model').value.trim();
  const difficulty = document.getElementById('difficulty').value;
  const autoStart = document.getElementById('auto-start').checked;
  const minWatchPct = parseInt(document.getElementById('min-watch').value, 10);

  const msg = document.getElementById('status-msg');

  if (!apiKey) {
    msg.textContent = 'API key is required.';
    msg.className = 'status-msg error';
    return;
  }

  await chrome.storage.local.set({
    llmConfig: { provider, apiKey, baseUrl, model, difficulty, autoStart, minWatchPct },
  });

  msg.textContent = 'Saved!';
  msg.className = 'status-msg saved';
  setTimeout(() => { msg.textContent = ''; msg.className = 'status-msg'; }, 2000);
}

document.getElementById('provider').addEventListener('change', e => showBaseUrl(e.target.value));
document.getElementById('min-watch').addEventListener('input', e => {
  document.getElementById('min-watch-display').textContent = `${e.target.value}%`;
});
document.getElementById('save-btn').addEventListener('click', save);

load();
