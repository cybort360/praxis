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
    let res;
    try {
      res = await fetch(this.baseURL, {
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
    } catch (networkErr) {
      throw new Error(`Network error reaching ${this.baseURL}: ${networkErr.message}`);
    }

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
