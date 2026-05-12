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
    const url = `${this.baseURL}/${this.model}:generateContent`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
        }),
      });
    } catch (networkErr) {
      throw new Error(`Network error reaching Gemini: ${networkErr.message}`);
    }

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

  async generateQuiz(plainText, timestampedText, videoTitle) {
    const DIFFICULTY_INSTRUCTIONS = {
      easy: 'Create straightforward recall questions that test basic understanding.',
      medium: 'Create a mix of recall and application questions.',
      hard: 'Create application and edge-case questions that require deep understanding of the concept.',
    };
    const difficultyInstruction =
      DIFFICULTY_INSTRUCTIONS[this.config.difficulty] ??
      DIFFICULTY_INSTRUCTIONS['medium'];

    const system = `You are an expert coding tutor creating a quiz. ${difficultyInstruction} Focus on the "why" behind concepts, not rote memorisation. Return JSON only.

When writing an explanation, if you reference a moment in the video, include a timestamp marker in the format [t=Ns] where N is the number of seconds (e.g. [t=272s]). Only use timestamps that appear in the provided transcript.`;

    const user = `Video title: "${videoTitle}"
Timestamped transcript:
${timestampedText}

Generate 3 quiz questions. Mix types: at least one multiple-choice, one predict-output (show a code snippet and ask what it outputs), and one free-text conceptual question.

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
    "options": ["output A", "output B", "output C", "output D"],
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
    const system = `You are an expert coding tutor. Generate a JavaScript coding challenge based on what was taught. The challenge should require genuine understanding, not copying from the video. Return JSON only.`;
    const user = `
Video title: "${videoTitle}"
Transcript: ${transcript.slice(0, 8000)}

Create one coding challenge. It must:
- Be solvable in under 30 minutes
- Require applying the core concept from the video in a slightly new context
- Include runnable test cases
- Have 3 progressive hints

Return ONLY valid JSON:
{
  "title": "Challenge title",
  "description": "What the user needs to build. Be specific about inputs and outputs.",
  "starterCode": "// starter code with function signature\nfunction solution() {\n  // your code here\n}",
  "tests": [
    {
      "description": "handles basic case",
      "input": "solution(arg1, arg2)",
      "expectedOutput": "42"
    },
    {
      "description": "handles string return",
      "input": "solution('hello')",
      "expectedOutput": "'Hello, world!'"
    }
  ],
  "hints": [
    "Hint 1 — gentle nudge",
    "Hint 2 — more specific",
    "Hint 3 — near-answer"
  ],
  "solution": "// full working solution\nfunction solution() { ... }"
}

IMPORTANT: "input" must be a JavaScript expression (e.g. solution(true)). "expectedOutput" must also be a valid JavaScript expression — wrap strings in single quotes (e.g. 'Access Denied'), use bare numbers (e.g. 42) or booleans (e.g. true) for non-string values.`;
    return this._parseJSON(await this._call(system, user));
  }

  async evaluateAnswer(question, userAnswer, transcript) {
    if (!userAnswer?.trim()) throw new Error('evaluateAnswer: userAnswer must not be empty');
    const system = `You are a fair and encouraging coding tutor. Evaluate the user's free-text answer. Be strict about correctness but kind in tone. Return JSON only.`;
    const user = `
Question: ${question}
User's answer: ${userAnswer}
Relevant transcript context: ${transcript.slice(0, 2000)}

Return ONLY valid JSON:
{
  "passed": true or false,
  "feedback": "1-2 sentences of feedback. If wrong, explain what was missing without giving the answer directly."
}`;
    return this._parseJSON(await this._call(system, user));
  }
}
