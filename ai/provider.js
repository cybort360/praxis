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
   *   options?: string[],          // multiple-choice only
   *   correctOption?: number,      // multiple-choice only (0-indexed)
   *   explanation: string,         // shown after answering
   *   codeSnippet?: string,        // optional code to display with the question
   * }
   */
  async generateQuiz(plainText, timestampedText, videoTitle) {
    throw new Error('generateQuiz() must be implemented by the provider');
  }

  /**
   * Generate a coding challenge based on what was taught.
   * @param {string} transcript
   * @param {string} videoTitle
   * @returns {Promise<Challenge>}
   *
   * Challenge shape:
   * {
   *   title: string,
   *   description: string,
   *   starterCode: string,         // pre-loaded into the IDE
   *   tests: TestCase[],           // run against user's code
   *   hints: string[],             // revealed one at a time
   *   solution: string,            // shown only after passing or giving up
   * }
   *
   * TestCase shape:
   * {
   *   description: string,
   *   input: string,               // JS expression to pass as argument
   *   expectedOutput: string,      // JS expression of expected return value
   * }
   */
  async generateChallenge(transcript, videoTitle) {
    throw new Error('generateChallenge() must be implemented by the provider');
  }

  /**
   * Evaluate a free-text quiz answer and return pass/fail + feedback.
   * @param {string} question
   * @param {string} userAnswer
   * @param {string} transcript
   * @returns {Promise<{ passed: boolean, feedback: string }>}
   */
  async evaluateAnswer(question, userAnswer, transcript) {
    throw new Error('evaluateAnswer() must be implemented by the provider');
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
