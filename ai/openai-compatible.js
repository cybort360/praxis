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
