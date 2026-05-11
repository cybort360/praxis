# Multi-Provider AI + Per-Provider Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenRouter, Groq, and Gemini as selectable AI providers with a per-provider model dropdown in the settings panel.

**Architecture:** One new `ai/openai-compatible.js` handles OpenAI, OpenRouter, and Groq (same API format, different base URLs). One new `ai/gemini.js` handles Google's different API shape. `ai/index.js` routes to the right provider class. The settings UI gains dynamic model selection that changes when the provider dropdown changes.

**Tech Stack:** Vanilla JS ES modules, Chrome Extension MV3, Gemini REST API, OpenAI-compatible REST API.

**Testing note:** No automated test runner. Each task includes manual verification steps — reload extension in `chrome://extensions` and test in the side panel.

---

## File Map

| File | Change |
|------|--------|
| `ai/openai-compatible.js` | **New** — parameterized OpenAI-format provider (handles OpenAI, OpenRouter, Groq) |
| `ai/gemini.js` | **New** — Gemini-specific provider |
| `ai/openai.js` | **Simplify** — re-exports `OpenAICompatibleProvider` as `OpenAIProvider` |
| `ai/index.js` | **Update** — import new providers, add openrouter/groq/gemini cases |
| `sidepanel/index.html` | **Update** — add 3 providers to dropdown, add `id` to model field container |
| `sidepanel/main.js` | **Update** — add `PROVIDER_MODELS`, `updateModelField()`, wire provider change event |

---

## Task 1: Create `ai/openai-compatible.js`

**Files:**
- Create: `ai/openai-compatible.js`

- [ ] **Write the file:**

```js
// ai/openai-compatible.js — OpenAI-compatible provider (OpenAI, OpenRouter, Groq, etc.)
// Any API that accepts { model, messages } and returns choices[0].message.content works here.
import { AIProvider } from './provider.js';

export class OpenAICompatibleProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model || config.defaultModel || 'gpt-4o-mini';
    this.baseURL = config.baseURL;
    this.extraHeaders = config.extraHeaders || {};
  }

  async _call(systemPrompt, userPrompt) {
    const res = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...this.extraHeaders,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2048,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`API error ${res.status}: ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  async generateSummary(transcript, videoTitle) {
    const system = `You are an expert coding tutor. Given a video transcript, produce a concise learning summary in JSON.`;
    const user = `
Video title: "${videoTitle}"
Transcript (may be truncated):
${transcript.slice(0, 8000)}

Return ONLY valid JSON:
{
  "title": "short topic title",
  "summary": "2-3 sentence summary of what was taught",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"]
}`;
    return this._parseJSON(await this._call(system, user));
  }

  async generateQuiz(transcript, videoTitle) {
    const system = `You are an expert coding tutor. Create quiz questions that test genuine understanding, not memorization. Return JSON only.`;
    const user = `
Video title: "${videoTitle}"
Transcript: ${transcript.slice(0, 8000)}

Generate 3 questions (one multiple-choice, one predict-output, one free-text).

Return ONLY a JSON array:
[
  {
    "id": "q1",
    "type": "multiple-choice",
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctOption": 0,
    "explanation": "..."
  },
  {
    "id": "q2",
    "type": "predict-output",
    "question": "What does this code output?",
    "codeSnippet": "...",
    "options": ["A", "B", "C", "D"],
    "correctOption": 2,
    "explanation": "..."
  },
  {
    "id": "q3",
    "type": "free-text",
    "question": "...",
    "explanation": "A good answer would mention..."
  }
]`;
    return this._parseJSON(await this._call(system, user));
  }

  async generateChallenge(transcript, videoTitle) {
    const system = `You are an expert coding tutor. Generate a JavaScript coding challenge based on what was taught. Return JSON only.`;
    const user = `
Video title: "${videoTitle}"
Transcript: ${transcript.slice(0, 8000)}

Return ONLY valid JSON:
{
  "title": "...",
  "description": "...",
  "starterCode": "function solution() {\n  // your code here\n}",
  "tests": [
    { "description": "...", "input": "solution(...)", "expectedOutput": "..." }
  ],
  "hints": ["Hint 1", "Hint 2", "Hint 3"],
  "solution": "// full solution"
}`;
    return this._parseJSON(await this._call(system, user));
  }

  async evaluateAnswer(question, userAnswer, transcript) {
    const system = `You are a fair and encouraging coding tutor. Evaluate answers strictly but kindly. Return JSON only.`;
    const user = `
Question: ${question}
User's answer: ${userAnswer}
Context: ${transcript.slice(0, 2000)}

Return ONLY valid JSON:
{ "passed": true or false, "feedback": "1-2 sentence feedback" }`;
    return this._parseJSON(await this._call(system, user));
  }
}
```

- [ ] **Verify:** Reload extension. Service worker DevTools shows no import errors.

- [ ] **Commit:**
```bash
git add ai/openai-compatible.js
git commit -m "feat: add OpenAI-compatible provider base class"
```

---

## Task 2: Create `ai/gemini.js`

**Files:**
- Create: `ai/gemini.js`

- [ ] **Write the file:**

```js
// ai/gemini.js — Google Gemini provider
// Uses a different endpoint and request shape than the OpenAI-compatible providers.
import { AIProvider } from './provider.js';

export class GeminiProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.0-flash';
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  async _call(systemPrompt, userPrompt) {
    const url = `${this.baseURL}/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Gemini API error ${res.status}: ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  async generateSummary(transcript, videoTitle) {
    const system = `You are an expert coding tutor. Given a video transcript, produce a concise learning summary in JSON.`;
    const user = `
Video title: "${videoTitle}"
Transcript (may be truncated):
${transcript.slice(0, 8000)}

Return ONLY valid JSON:
{
  "title": "short topic title",
  "summary": "2-3 sentence summary of what was taught",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"]
}`;
    return this._parseJSON(await this._call(system, user));
  }

  async generateQuiz(transcript, videoTitle) {
    const system = `You are an expert coding tutor. Create quiz questions that test genuine understanding, not memorization. Return JSON only.`;
    const user = `
Video title: "${videoTitle}"
Transcript: ${transcript.slice(0, 8000)}

Generate 3 questions (one multiple-choice, one predict-output, one free-text).

Return ONLY a JSON array:
[
  {
    "id": "q1",
    "type": "multiple-choice",
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctOption": 0,
    "explanation": "..."
  },
  {
    "id": "q2",
    "type": "predict-output",
    "question": "What does this code output?",
    "codeSnippet": "...",
    "options": ["A", "B", "C", "D"],
    "correctOption": 2,
    "explanation": "..."
  },
  {
    "id": "q3",
    "type": "free-text",
    "question": "...",
    "explanation": "A good answer would mention..."
  }
]`;
    return this._parseJSON(await this._call(system, user));
  }

  async generateChallenge(transcript, videoTitle) {
    const system = `You are an expert coding tutor. Generate a JavaScript coding challenge based on what was taught. Return JSON only.`;
    const user = `
Video title: "${videoTitle}"
Transcript: ${transcript.slice(0, 8000)}

Return ONLY valid JSON:
{
  "title": "...",
  "description": "...",
  "starterCode": "function solution() {\n  // your code here\n}",
  "tests": [
    { "description": "...", "input": "solution(...)", "expectedOutput": "..." }
  ],
  "hints": ["Hint 1", "Hint 2", "Hint 3"],
  "solution": "// full solution"
}`;
    return this._parseJSON(await this._call(system, user));
  }

  async evaluateAnswer(question, userAnswer, transcript) {
    const system = `You are a fair and encouraging coding tutor. Evaluate answers strictly but kindly. Return JSON only.`;
    const user = `
Question: ${question}
User's answer: ${userAnswer}
Context: ${transcript.slice(0, 2000)}

Return ONLY valid JSON:
{ "passed": true or false, "feedback": "1-2 sentence feedback" }`;
    return this._parseJSON(await this._call(system, user));
  }
}
```

- [ ] **Verify:** Reload extension. Service worker DevTools shows no import errors.

- [ ] **Commit:**
```bash
git add ai/gemini.js
git commit -m "feat: add Gemini provider"
```

---

## Task 3: Simplify `ai/openai.js` + Update `ai/index.js`

**Files:**
- Modify: `ai/openai.js`
- Modify: `ai/index.js`

- [ ] **Replace `ai/openai.js` entirely:**

```js
// ai/openai.js — OpenAI provider (delegates to OpenAICompatibleProvider)
export { OpenAICompatibleProvider as OpenAIProvider } from './openai-compatible.js';
```

- [ ] **Replace `ai/index.js` entirely:**

```js
// ai/index.js — Provider factory
// To add a new OpenAI-compatible provider: add a case with baseURL + defaultModel.
// To add a custom-API provider: create ai/yourprovider.js, import it, add a case.

import { AnthropicProvider } from './anthropic.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { GeminiProvider } from './gemini.js';

/**
 * llmConfig shape (stored in chrome.storage.local):
 * {
 *   provider: 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'gemini',
 *   apiKey: string,
 *   model?: string  // exact model ID; if omitted, provider uses its default
 * }
 */
export async function getAIProvider() {
  const { llmConfig } = await chrome.storage.local.get('llmConfig');

  if (!llmConfig?.provider) {
    throw new Error('No AI provider configured. Open the extension popup to set your API key.');
  }

  if (!llmConfig?.apiKey) {
    throw new Error('No API key found. Open the extension popup to enter your API key.');
  }

  switch (llmConfig.provider) {
    case 'anthropic':
      return new AnthropicProvider(llmConfig);

    case 'openai':
      return new OpenAICompatibleProvider({
        ...llmConfig,
        baseURL: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o-mini',
      });

    case 'openrouter':
      return new OpenAICompatibleProvider({
        ...llmConfig,
        baseURL: 'https://openrouter.ai/api/v1/chat/completions',
        defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
        extraHeaders: {
          'HTTP-Referer': 'https://github.com/learnloop',
          'X-Title': 'LearnLoop',
        },
      });

    case 'groq':
      return new OpenAICompatibleProvider({
        ...llmConfig,
        baseURL: 'https://api.groq.com/openai/v1/chat/completions',
        defaultModel: 'llama-3.3-70b-versatile',
      });

    case 'gemini':
      return new GeminiProvider(llmConfig);

    default:
      throw new Error(`Unknown provider: "${llmConfig.provider}".`);
  }
}
```

- [ ] **Verify:** Reload extension. Service worker DevTools — no import errors.

- [ ] **Commit:**
```bash
git add ai/openai.js ai/index.js
git commit -m "feat: wire OpenRouter, Groq, Gemini into provider factory"
```

---

## Task 4: Update settings UI — HTML

**Files:**
- Modify: `sidepanel/index.html`

- [ ] **Add three providers to `#setting-provider` dropdown. Find:**
```html
        <select id="setting-provider" class="settings-select">
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT)</option>
        </select>
```

Replace with:
```html
        <select id="setting-provider" class="settings-select">
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="openrouter">OpenRouter (free models available)</option>
          <option value="groq">Groq (fast · free tier)</option>
          <option value="gemini">Google Gemini</option>
        </select>
```

- [ ] **Add `id="model-field-container"` to the model field wrapper. Find:**
```html
      <div class="settings-field">
        <label for="setting-model">Model <span class="settings-optional">(optional)</span></label>
        <input type="text" id="setting-model" class="settings-input" placeholder="Leave blank for default" />
      </div>
```

Replace with:
```html
      <div class="settings-field" id="model-field-container">
        <label for="setting-model">Model <span class="settings-optional">(optional)</span></label>
        <input type="text" id="setting-model" class="settings-input" placeholder="Leave blank for default" />
      </div>
```

- [ ] **Verify:** Reload extension, open side panel. Provider dropdown now shows 5 options.

- [ ] **Commit:**
```bash
git add sidepanel/index.html
git commit -m "feat: add OpenRouter, Groq, Gemini to settings provider dropdown"
```

---

## Task 5: Update settings UI — JS (model selection logic)

**Files:**
- Modify: `sidepanel/main.js`

- [ ] **Add `PROVIDER_MODELS` constant and `updateModelField()` using safe DOM methods. Find the `// ── Settings ──` comment and insert BEFORE it:**

```js
// ── Provider model lists ──
const PROVIDER_MODELS = {
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — Fast · Cheap (default)' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 — Balanced' },
    { id: 'claude-opus-4-7',           label: 'Claude Opus 4.7 — Most capable' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini — Fast · Cheap (default)' },
    { id: 'gpt-4o',      label: 'GPT-4o — Most capable' },
  ],
  openrouter: null,
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — Balanced (default)' },
    { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B — Fastest' },
    { id: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B' },
    { id: 'gemma2-9b-it',            label: 'Gemma 2 9B' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — Fast · Free tier (default)' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro — Most capable' },
  ],
};

function updateModelField(provider, savedModel) {
  const container = document.getElementById('model-field-container');
  const models = PROVIDER_MODELS[provider];

  // Clear existing children
  while (container.firstChild) container.removeChild(container.firstChild);

  const label = document.createElement('label');
  label.setAttribute('for', 'setting-model');

  if (models === null) {
    // OpenRouter: free-text input
    label.textContent = 'Model ';
    const hint = document.createElement('span');
    hint.className = 'settings-optional';
    hint.textContent = '(optional)';
    label.appendChild(hint);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'setting-model';
    input.className = 'settings-input';
    input.placeholder = 'e.g. meta-llama/llama-3.3-70b-instruct:free';
    if (savedModel) input.value = savedModel;

    container.appendChild(label);
    container.appendChild(input);
  } else {
    // Known provider: dropdown
    label.textContent = 'Model';

    const select = document.createElement('select');
    select.id = 'setting-model';
    select.className = 'settings-select';

    models.forEach(m => {
      const option = document.createElement('option');
      option.value = m.id;
      option.textContent = m.label;
      if (savedModel === m.id) option.selected = true;
      select.appendChild(option);
    });

    container.appendChild(label);
    container.appendChild(select);
  }
}

```

- [ ] **Replace the entire `// ── Settings ──` block. Find:**
```js
// ── Settings ──

chrome.storage.local.get('llmConfig').then(({ llmConfig }) => {
  if (!llmConfig) return;
  document.getElementById('setting-provider').value = llmConfig.provider || 'anthropic';
  document.getElementById('setting-apikey').value = llmConfig.apiKey || '';
  document.getElementById('setting-model').value = llmConfig.model || '';
});

document.getElementById('btn-save-settings').addEventListener('click', () => {
  const provider = document.getElementById('setting-provider').value;
  const apiKey = document.getElementById('setting-apikey').value.trim();
  const model = document.getElementById('setting-model').value.trim();
  const status = document.getElementById('settings-status');

  if (!apiKey) {
    status.style.color = 'var(--error)';
    status.textContent = 'API key is required.';
    return;
  }

  chrome.storage.local.set({ llmConfig: { provider, apiKey, model: model || undefined } })
    .then(() => {
      status.style.color = 'var(--success)';
      status.textContent = 'Saved!';
      setTimeout(() => { status.textContent = ''; }, 2000);
    });
});
```

Replace with:
```js
// ── Settings ──

chrome.storage.local.get('llmConfig').then(({ llmConfig }) => {
  const provider = llmConfig?.provider || 'anthropic';
  document.getElementById('setting-provider').value = provider;
  document.getElementById('setting-apikey').value = llmConfig?.apiKey || '';
  updateModelField(provider, llmConfig?.model || '');
});

document.getElementById('setting-provider').addEventListener('change', (e) => {
  updateModelField(e.target.value, '');
});

document.getElementById('btn-save-settings').addEventListener('click', () => {
  const provider = document.getElementById('setting-provider').value;
  const apiKey = document.getElementById('setting-apikey').value.trim();
  const model = document.getElementById('setting-model').value.trim();
  const status = document.getElementById('settings-status');

  if (!apiKey) {
    status.style.color = 'var(--error)';
    status.textContent = 'API key is required.';
    return;
  }

  chrome.storage.local.set({ llmConfig: { provider, apiKey, model: model || undefined } })
    .then(() => {
      status.style.color = 'var(--success)';
      status.textContent = 'Saved!';
      setTimeout(() => { status.textContent = ''; }, 2000);
    });
});
```

- [ ] **Verify manually:**
  1. Reload extension. Open side panel.
  2. Model field shows a dropdown — Anthropic models listed, Haiku selected by default.
  3. Change provider to OpenAI → model dropdown shows GPT-4o mini and GPT-4o.
  4. Change to OpenRouter → model field becomes a text input with placeholder.
  5. Change to Groq → model dropdown shows 4 models, Llama 3.3 70B selected.
  6. Change to Gemini → model dropdown shows 3 Gemini models.
  7. Select Groq + Llama 3.1 8B, enter any key, click Save. Reload extension, reopen side panel — Groq selected, Llama 3.1 8B pre-selected.

- [ ] **Commit:**
```bash
git add sidepanel/main.js
git commit -m "feat: dynamic per-provider model selection in settings panel"
```

---

## Self-Review

**Spec coverage:**
- `ai/openai-compatible.js` — Task 1 ✅
- `ai/gemini.js` — Task 2 ✅
- `ai/openai.js` simplified — Task 3 ✅
- `ai/index.js` with all 5 cases — Task 3 ✅
- OpenRouter extra headers — Task 3 ✅
- Provider dropdown updated — Task 4 ✅
- `PROVIDER_MODELS` constant — Task 5 ✅
- `updateModelField()` with safe DOM methods, null path (text input) for OpenRouter — Task 5 ✅
- Saved model pre-selected on load — Task 5 ✅
- Provider change event updates model field — Task 5 ✅

**Placeholder scan:** No TBDs. All code is complete.

**Type consistency:**
- `OpenAICompatibleProvider` constructor: `{ apiKey, model, baseURL, defaultModel, extraHeaders }` — consistent Tasks 1 and 3 ✅
- `GeminiProvider` constructor: `{ apiKey, model }` — consistent Tasks 2 and 3 ✅
- `updateModelField(provider, savedModel)` — defined and called consistently in Task 5 ✅
- `#model-field-container` id — added Task 4, used in `updateModelField` Task 5 ✅
- `PROVIDER_MODELS` keys match `llmConfig.provider` values in `ai/index.js` ✅
