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

  async generateChallenge(summary, videoTitle) {
    const summaryText = summary
      ? `${summary.summary}\n\nKey concepts:\n${(summary.keyPoints || []).join('\n')}`
      : videoTitle;
    const system = `You are an expert coding tutor. Generate a coding challenge based on what was taught. Detect the primary programming language from the video title and learning summary. The challenge should require genuine understanding, not copying from the video. Return JSON only.`;
    const user = `
Video title: "${videoTitle}"

What was taught:
${summaryText}

First, identify the primary programming language taught in this video. Then create one coding challenge in that language. It must:
- Be solvable in under 30 minutes
- Require applying the core concept from the video in a slightly new context
- Include a self-contained testRunner that prints PASS/FAIL lines
- Have 3 progressive hints

The testRunner must use this exact stdout protocol:
  PASS: <description>
  FAIL: <description> | got: <actual> | expected: <expected>

Return ONLY valid JSON:
{
  "language": "rust",
  "title": "Challenge title",
  "description": "What the user needs to build. Be specific about inputs and outputs.",
  "starterCode": "starter code with the function signature the user must implement",
  "testRunner": "self-contained code that calls the user solution and prints PASS/FAIL lines — this is appended to the user's code and run as a complete program",
  "hints": [
    "Hint 1 — gentle nudge",
    "Hint 2 — more specific",
    "Hint 3 — near-answer"
  ],
  "solution": "full working solution"
}

LANGUAGE-SPECIFIC RULES for testRunner:

For Rust: starterCode contains the fn to implement (no main). testRunner is a fn main() that calls it and prints PASS/FAIL.
Example testRunner for Rust:
  fn main() {
    let r = solution(2, 3);
    if r == 5 { println!("PASS: adds two numbers"); }
    else { println!("FAIL: adds two numbers | got: {} | expected: 5", r); }
  }

For Python: testRunner is plain Python that calls the function and prints PASS/FAIL.
Example:
  r = solution(2, 3)
  if r == 5: print("PASS: adds two numbers")
  else: print(f"FAIL: adds two numbers | got: {r} | expected: 5")

For JavaScript/TypeScript: testRunner is JS that calls the function and uses console.log for PASS/FAIL.
Example:
  const r = solution(2, 3);
  if (r === 5) console.log("PASS: adds two numbers");
  else console.log(\`FAIL: adds two numbers | got: \${r} | expected: 5\`);

For C/C++/Java/Go/other: follow the same PASS/FAIL pattern using that language's print function. testRunner must be a valid entry point (main function) that can run standalone when appended to the user's solution code.`;
    return this._parseJSON(await this._call(system, user));
  }

  async evaluateAnswer(question, userAnswer, summaryContext) {
    if (!userAnswer?.trim()) throw new Error('evaluateAnswer: userAnswer must not be empty');
    const system = `You are a fair and encouraging coding tutor. Evaluate the user's free-text answer. Be strict about correctness but kind in tone. Return JSON only.`;
    const contextLine = summaryContext ? `\nCourse context: ${summaryContext}` : '';
    const user = `
Question: ${question}
User's answer: ${userAnswer}${contextLine}

Return ONLY valid JSON:
{
  "passed": true or false,
  "feedback": "1-2 sentences of feedback. If wrong, explain what was missing without giving the answer directly."
}`;
    return this._parseJSON(await this._call(system, user));
  }

  async chat(messages, summary, videoTitle) {
    const contextSection = summary
      ? `What was taught:\n${summary.summary}\n\nKey concepts:\n${(summary.keyPoints || []).join('\n')}`
      : 'No content summary available for this video.';
    const systemText = `You are a concise tutor helping a learner understand a video they just watched. Answer questions based on the video content summary. If the answer is not in the summary, say so. Keep answers to 2–3 sentences unless a longer explanation is clearly needed.\n\nVideo: "${videoTitle}"\n\n${contextSection}`;
    // Gemini uses 'user'/'model' roles — map 'assistant' → 'model'
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const url = `${this.baseURL}/${this.model}:generateContent`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: { maxOutputTokens: 512, temperature: 0.4 },
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
    return { reply: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '' };
  }
}
