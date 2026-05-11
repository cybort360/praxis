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
