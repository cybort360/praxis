// ── Theme ────────────────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('ll-theme') || 'dark';
  applyTheme(saved, false);
})();

function applyTheme(theme, animate = true) {
  if (!animate) document.documentElement.style.transition = 'none';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ll-theme', theme);
  const useEl = document.querySelector('#theme-icon use');
  if (useEl) useEl.setAttribute('href', theme === 'light' ? '#ic-moon' : '#ic-sun');
  if (!animate) requestAnimationFrame(() => { document.documentElement.style.transition = ''; });
}

document.getElementById('btn-theme').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ── API key show/hide ─────────────────────────────────────────────────────────
document.getElementById('toggle-key').addEventListener('click', () => {
  const input = document.getElementById('api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
});

// ── Min-watch pills ───────────────────────────────────────────────────────────
const pillGroup  = document.getElementById('min-watch-pills');
const hiddenInput = document.getElementById('min-watch');

function selectPill(value) {
  document.querySelectorAll('#min-watch-pills .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.value === String(value));
  });
  hiddenInput.value = value;
}

pillGroup.addEventListener('click', e => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  selectPill(pill.dataset.value);
});

// Show/hide the min-watch section based on toggle
const autoStartEl    = document.getElementById('auto-start');
const minWatchField  = document.getElementById('min-watch-field');

function syncMinWatchVisibility() {
  minWatchField.classList.toggle('visible', autoStartEl.checked);
}

autoStartEl.addEventListener('change', syncMinWatchVisibility);

// ── Load ──────────────────────────────────────────────────────────────────────
const DEFAULTS = {
  provider:    'anthropic',
  apiKey:      '',
  model:       '',
  difficulty:  'medium',
  autoStart:   false,
  minWatchPct: 0,
};

async function load() {
  const stored = await chrome.storage.local.get('llmConfig');
  const cfg    = { ...DEFAULTS, ...(stored.llmConfig || {}) };

  document.getElementById('provider').value   = cfg.provider;
  document.getElementById('api-key').value    = cfg.apiKey || '';
  document.getElementById('model').value      = cfg.model  || '';
  document.getElementById('difficulty').value = cfg.difficulty || 'medium';
  autoStartEl.checked = !!cfg.autoStart;
  selectPill(cfg.minWatchPct ?? 0);
  syncMinWatchVisibility();
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  const provider    = document.getElementById('provider').value;
  const apiKey      = document.getElementById('api-key').value.trim();
  const model       = document.getElementById('model').value.trim();
  const difficulty  = document.getElementById('difficulty').value;
  const autoStart   = autoStartEl.checked;
  const minWatchPct = parseInt(hiddenInput.value, 10) || 0;

  const msg = document.getElementById('status-msg');

  if (!apiKey) {
    msg.textContent = 'API key is required.';
    msg.className   = 'status-msg error';
    document.getElementById('api-key').focus();
    return;
  }

  await chrome.storage.local.set({
    llmConfig: { provider, apiKey, model, difficulty, autoStart, minWatchPct },
  });

  msg.textContent = '✓ Settings saved';
  msg.className   = 'status-msg saved';
  setTimeout(() => { msg.textContent = ''; msg.className = 'status-msg'; }, 2500);
}

document.getElementById('save-btn').addEventListener('click', save);

load();
