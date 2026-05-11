// ai/anthropic.js — Anthropic (Claude) provider
import { AIProvider } from './provider.js';

export class AnthropicProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-haiku-4-5-20251001'; // fast + cheap for MVP
    this.baseURL = 'https://api.anthropic.com/v1/messages';
  }

  async _call(systemPrompt, userPrompt) {
    const res = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Anthropic API error ${res.status}: ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text ?? '';
  }

  async generateSummary(transcript, videoTitle) {
    const system = `You are an expert coding tutor. Given a video transcript, produce a concise learning summary in JSON.`;

    const user = `
Video title: "${videoTitle}"

Transcript (may be truncated):
${transcript.slice(0, 8000)}

Return ONLY valid JSON in this exact shape:
{
  "title": "short topic title",
  "summary": "2-3 sentence summary of what was taught",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"]
}`;

    const raw = await this._call(system, user);
    return this._parseJSON(raw);
  }

  async generateQuiz(transcript, videoTitle) {
    const system = `You are an expert coding tutor creating a quiz to test genuine understanding, not memorization. Focus on the "why" behind concepts. Return JSON only.`;

    const user = `
Video title: "${videoTitle}"

Transcript:
${transcript.slice(0, 8000)}

Generate 3 quiz questions. Mix types: at least one multiple-choice, one predict-output (show a code snippet and ask what it outputs), and one free-text conceptual question.

Return ONLY valid JSON as an array:
[
  {
    "id": "q1",
    "type": "multiple-choice",
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctOption": 0,
    "explanation": "Why this answer is correct"
  },
  {
    "id": "q2",
    "type": "predict-output",
    "question": "What does this code output?",
    "codeSnippet": "console.log(...)",
    "options": ["A", "B", "C", "D"],
    "correctOption": 2,
    "explanation": "..."
  },
  {
    "id": "q3",
    "type": "free-text",
    "question": "In your own words, explain why...",
    "explanation": "A good answer would mention..."
  }
]`;

    const raw = await this._call(system, user);
    return this._parseJSON(raw);
  }

  async generateChallenge(transcript, videoTitle) {
    const system = `You are an expert coding tutor. Generate a JavaScript coding challenge based on what was taught. The challenge should require genuine understanding, not copying from the video. Return JSON only.`;

    const user = `
Video title: "${videoTitle}"

Transcript:
${transcript.slice(0, 8000)}

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
      "expectedOutput": "expectedValue"
    }
  ],
  "hints": [
    "Hint 1 — gentle nudge",
    "Hint 2 — more specific",
    "Hint 3 — near-answer"
  ],
  "solution": "// full working solution\nfunction solution() { ... }"
}`;

    const raw = await this._call(system, user);
    return this._parseJSON(raw);
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

    const raw = await this._call(system, user);
    return this._parseJSON(raw);
  }
}
