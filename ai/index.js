// ai/index.js — Provider factory
// To add a new provider:
//   1. Create ai/yourprovider.js extending AIProvider
//   2. Import it here and add a case to the switch below
//   3. In the popup settings, add the provider name to the dropdown

import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

/**
 * Returns the configured AI provider instance.
 * Config is stored in chrome.storage.local under the key 'llmConfig'.
 *
 * llmConfig shape:
 * {
 *   provider: 'anthropic' | 'openai' | 'gemini' | ...,
 *   apiKey: 'sk-...',
 *   model: 'claude-haiku-4-5-20251001' (optional override)
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
      return new OpenAIProvider(llmConfig);

    // ── Add new providers here ──
    // case 'gemini':
    //   return new GeminiProvider(llmConfig);

    default:
      throw new Error(`Unknown provider: "${llmConfig.provider}". Check ai/index.js to add it.`);
  }
}
