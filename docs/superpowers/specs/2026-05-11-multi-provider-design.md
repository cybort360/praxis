# Multi-Provider AI + Per-Provider Model Selection — Design Spec
Date: 2026-05-11

## Scope

Add three new AI providers (OpenRouter, Groq, Gemini) and per-provider model selection to the settings panel.

---

## Provider Architecture

### New file: `ai/openai-compatible.js`

A parameterized OpenAI-format provider. Constructor accepts `{ apiKey, model, baseURL, defaultModel }`. Implements all 4 methods (`generateSummary`, `generateQuiz`, `generateChallenge`, `evaluateAnswer`) using the OpenAI chat completions request/response shape — identical logic to the existing `openai.js` but with `baseURL` and `defaultModel` as constructor params instead of hardcoded strings.

`openai.js` is simplified to instantiate `OpenAICompatibleProvider` with OpenAI's URL and default model, delegating all implementation.

### New file: `ai/gemini.js`

Gemini uses a different endpoint and schema:
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`
- Request body: `{ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: userPrompt }] }], generationConfig: { maxOutputTokens: 2048, temperature: 0.4 } }`
- Response path: `data.candidates[0].content.parts[0].text`

Implements all 4 methods using this format. Default model: `gemini-2.0-flash`.

### Updated: `ai/index.js`

| Provider key | Class | Base URL | Default model |
|---|---|---|---|
| `anthropic` | `AnthropicProvider` | `https://api.anthropic.com/v1/messages` | `claude-haiku-4-5-20251001` |
| `openai` | `OpenAICompatibleProvider` | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| `openrouter` | `OpenAICompatibleProvider` | `https://openrouter.ai/api/v1/chat/completions` | `meta-llama/llama-3.3-70b-instruct:free` — also adds `HTTP-Referer: https://github.com/learnloop` and `X-Title: LearnLoop` headers (OpenRouter attribution) |
| `groq` | `OpenAICompatibleProvider` | `https://api.groq.com/openai/v1/chat/completions` | `llama-3.3-70b-versatile` |
| `gemini` | `GeminiProvider` | *(built into class)* | `gemini-2.0-flash` |

---

## Settings UI

### Provider dropdown

Five options in `sidepanel/index.html` `#setting-provider`:
- `anthropic` — Anthropic (Claude)
- `openai` — OpenAI (GPT)
- `openrouter` — OpenRouter (free models available)
- `groq` — Groq (fast + free tier)
- `gemini` — Google Gemini

### Model selection

The model field changes dynamically when the provider dropdown changes. Defined as a constant `PROVIDER_MODELS` in `sidepanel/main.js`:

```js
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
  openrouter: null, // text input — too many models to enumerate
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — Balanced (default)' },
    { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B — Fastest' },
    { id: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B' },
    { id: 'gemma2-9b-it',            label: 'Gemma 2 9B' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash',   label: 'Gemini 2.0 Flash — Fast · Free tier (default)' },
    { id: 'gemini-1.5-flash',   label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro',     label: 'Gemini 1.5 Pro — Most capable' },
  ],
};
```

**Behaviour:**
- When `#setting-provider` changes, `updateModelField(provider)` runs.
- If `PROVIDER_MODELS[provider]` is an array: replace the model field with a `<select>` populated from the array; first item is selected by default.
- If `null` (OpenRouter): replace the model field with a `<input type="text">` with placeholder `e.g. meta-llama/llama-3.3-70b-instruct:free`.
- On load, restore the saved provider and model, pre-selecting the saved model in the dropdown (or pre-filling the text input).

The saved `model` value is always the exact model ID string passed directly to the API.

---

## Files Changed

| File | Change |
|------|--------|
| `ai/openai-compatible.js` | New — parameterized OpenAI-format provider |
| `ai/gemini.js` | New — Gemini-specific provider |
| `ai/openai.js` | Simplified — delegates to `OpenAICompatibleProvider` |
| `ai/index.js` | Add openrouter, groq, gemini cases |
| `sidepanel/index.html` | Add openrouter, groq, gemini to provider dropdown |
| `sidepanel/main.js` | Add `PROVIDER_MODELS`, `updateModelField()`, update settings load/save logic |

`background.js`, `ai/anthropic.js`, `ai/provider.js` — untouched.
