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

// ── Platform config ───────────────────────────────────────────────────────
const DEFAULT_PLATFORM_LIST = [
  { name: 'Udemy',             host: 'www.udemy.com' },
  { name: 'Coursera',          host: 'www.coursera.org' },
  { name: 'LinkedIn Learning', host: 'www.linkedin.com/learning/' },
  { name: 'Khan Academy',      host: 'www.khanacademy.org' },
  { name: 'Pluralsight',       host: 'app.pluralsight.com' },
];

// Current enabled list (in memory, synced with storage)
let enabledPlatforms = DEFAULT_PLATFORM_LIST.map(p => p.host);

async function savePlatformConfig() {
  await chrome.storage.local.set({ platformConfig: { enabled: enabledPlatforms } });
}

function renderPlatformRow(container, name, host, isCustom) {
  const row = document.createElement('div');
  row.className    = 'platform-row';
  row.dataset.host = host;

  const info = document.createElement('div');
  info.className   = 'platform-info';
  info.innerHTML   =
    `<div class="platform-name">${name}</div>
     <div class="platform-host">${host}</div>`;

  // Toggle switch (reuse the same HTML pattern as auto-start)
  const switchLabel = document.createElement('label');
  switchLabel.className = 'switch';
  const checkbox = document.createElement('input');
  checkbox.type    = 'checkbox';
  checkbox.checked = enabledPlatforms.includes(host);
  checkbox.addEventListener('change', async () => {
    if (checkbox.checked) {
      if (!enabledPlatforms.includes(host)) enabledPlatforms.push(host);
    } else {
      enabledPlatforms = enabledPlatforms.filter(h => h !== host);
    }
    await savePlatformConfig();
  });
  const track = document.createElement('span');
  track.className  = 'track';
  track.innerHTML  = '<span class="thumb"></span>';
  switchLabel.append(checkbox, track);

  row.append(info, switchLabel);

  if (isCustom) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-platform';
    removeBtn.title     = 'Remove';
    removeBtn.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            style="width:13px;height:13px">
         <line x1="18" y1="6" x2="6" y2="18"/>
         <line x1="6" y1="6" x2="18" y2="18"/>
       </svg>`;
    removeBtn.addEventListener('click', async () => {
      enabledPlatforms = enabledPlatforms.filter(h => h !== host);
      await savePlatformConfig();
      row.remove();
    });
    row.append(removeBtn);
  }

  container.appendChild(row);
}

function renderAllPlatforms() {
  const defaultContainer = document.getElementById('default-platforms');
  const customContainer  = document.getElementById('custom-platforms');
  defaultContainer.innerHTML = '';
  customContainer.innerHTML  = '';

  // Render the five defaults
  DEFAULT_PLATFORM_LIST.forEach(({ name, host }) => {
    renderPlatformRow(defaultContainer, name, host, false);
  });

  // Render any custom entries (ones not in the default list)
  const defaultHosts = DEFAULT_PLATFORM_LIST.map(p => p.host);
  enabledPlatforms
    .filter(h => !defaultHosts.includes(h))
    .forEach(h => renderPlatformRow(customContainer, h, h, true));
}

function setupAddSite() {
  const input    = document.getElementById('add-site-input');
  const btn      = document.getElementById('add-site-btn');
  const errorEl  = document.getElementById('add-site-error');

  btn.addEventListener('click', async () => {
    errorEl.textContent = '';
    // Normalise: strip protocol and trailing slashes
    let raw = input.value.trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');

    if (!raw || !/^[a-z0-9][a-z0-9\-\.]+\.[a-z]{2,}/i.test(raw)) {
      errorEl.textContent = 'Enter a valid hostname (e.g. egghead.io)';
      return;
    }

    const host = raw.toLowerCase();
    const allKnown = [
      ...DEFAULT_PLATFORM_LIST.map(p => p.host),
      ...enabledPlatforms,
    ];
    if (allKnown.includes(host)) {
      errorEl.textContent = 'Already in the list.';
      return;
    }

    enabledPlatforms.push(host);
    await savePlatformConfig();
    renderPlatformRow(document.getElementById('custom-platforms'), host, host, true);
    input.value = '';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') btn.click();
  });
}

async function loadPlatforms() {
  const stored = await chrome.storage.local.get('platformConfig');
  // If no config stored yet, write the defaults
  if (!stored.platformConfig) {
    enabledPlatforms = DEFAULT_PLATFORM_LIST.map(p => p.host);
    await savePlatformConfig();
  } else {
    enabledPlatforms = stored.platformConfig.enabled ?? DEFAULT_PLATFORM_LIST.map(p => p.host);
  }
  renderAllPlatforms();
  setupAddSite();
}

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
  await loadPlatforms();
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
