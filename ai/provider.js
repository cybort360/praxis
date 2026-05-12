// ai/provider.js — Abstract base class for all AI providers
// To add a new provider: extend this class and implement all methods.

export class AIProvider {
  constructor(config = {}) {
    if (new.target === AIProvider) {
      throw new Error('AIProvider is abstract. Use a concrete provider like AnthropicProvider.');
    }
    this.config = config;
  }

  /**
   * Generate a concise summary of what was taught in the video.
   * @param {string} transcript - Full video transcript text
   * @param {string} videoTitle - Title of the video
   * @returns {Promise<{ title: string, summary: string, keyPoints: string[] }>}
   */
  async generateSummary(transcript, videoTitle) {
    throw new Error('generateSummary() must be implemented by the provider');
  }

  /**
   * Generate a quiz to test understanding before the user can code.
   * @param {string} plainText - Full video transcript as plain text
   * @param {string} timestampedText - Transcript with [m:ss] prefixes, capped ~6000 chars
   * @param {string} videoTitle
   * @returns {Promise<Question[]>}
   *
   * Question shape:
   * {
   *   id: string,
   *   type: 'multiple-choice' | 'free-text' | 'predict-output',
   *   question: string,
   *   options?: string[],          // multiple-choice and predict-output
   *   correctOption?: number,      // multiple-choice and predict-output (0-indexed)
   *   explanation: string,         // shown after answering
   *   codeSnippet?: string,        // optional code to display with the question
   * }
   */
  async generateQuiz(plainText, timestampedText, videoTitle) {
    throw new Error('generateQuiz() must be implemented by the provider');
  }

  /**
   * Generate a coding challenge based on what was taught.
   * @param {{ title: string, summary: string, keyPoints: string[] }} summary - Already-generated summary (compact, ~400 chars)
   * @param {string} videoTitle
   * @returns {Promise<Challenge>}
   *
   * Challenge shape:
   * {
   *   language: string,            // detected programming language
   *   title: string,
   *   description: string,
   *   starterCode: string,         // pre-loaded into the IDE
   *   testRunner: string,          // appended to user code and executed; prints PASS/FAIL lines
   *   hints: string[],             // revealed one at a time
   *   solution: string,            // shown only after passing or giving up
   * }
   */
  async generateChallenge(summary, videoTitle) {
    throw new Error('generateChallenge() must be implemented by the provider');
  }

  /**
   * Evaluate a free-text quiz answer and return pass/fail + feedback.
   * @param {string} question
   * @param {string} userAnswer
   * @param {string} summaryContext - Key points joined as a string (~200 chars); replaces raw transcript
   * @returns {Promise<{ passed: boolean, feedback: string }>}
   */
  async evaluateAnswer(question, userAnswer, summaryContext) {
    throw new Error('evaluateAnswer() must be implemented by the provider');
  }

  /**
   * Answer a user's question about the video using conversation history.
   * @param {{ role: 'user'|'assistant', content: string }[]} messages - Full conversation so far
   * @param {{ title: string, summary: string, keyPoints: string[] }} summary - Compact session summary (~400 chars); replaces raw transcript
   * @param {string} videoTitle
   * @returns {Promise<{ reply: string }>}
   */
  async chat(messages, summary, videoTitle) {
    throw new Error('chat() must be implemented by the provider');
  }

  // ── Shared helper: safe JSON parse from LLM output ──
  _parseJSON(text) {
    // Strip markdown code fences if the model wrapped the JSON
    const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`AI returned invalid JSON: ${e.message}\n\nRaw: ${text.slice(0, 300)}`);
    }
  }
}
