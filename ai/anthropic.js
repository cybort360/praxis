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

STEP 1 — Assess the audience:
Read the title and content carefully. Is this video aimed at complete beginners (e.g. "CSS for beginners", "intro to HTML", first-time learners who likely don't know what a function is) or at people who already know how to program?

STEP 2 — Pick the language:
CSS and HTML are not executable. If the video is about CSS or HTML, set language to "javascript".
For everything else, use the language actually taught.

STEP 3 — Design the challenge for the audience:

If BEGINNER (no prior programming knowledge assumed):
  - Do NOT write function definitions. Beginners don't know what functions are.
  - Use simple const variable assignments. The user fills in 1–3 specific values.
  - Starter code should be ~80% complete. The user makes small, targeted edits.
  - Example (CSS color video):
      // Complete the styles for a danger button
      const backgroundColor = ''; // should be '#dc2626'
      const borderRadius = '';    // should be '6px'
  - testRunner checks each variable directly:
      if (backgroundColor === '#dc2626') console.log('PASS: correct background color');
      else console.log(\`FAIL: background color | got: \${backgroundColor} | expected: #dc2626\`);

If INTERMEDIATE / ADVANCED (viewer already knows the basics):
  - Function-based challenge is fine.
  - For CSS/HTML topics: CSS properties must be JavaScript string values or object properties. NEVER write raw CSS syntax inside JS code — it causes a syntax error.
  - WRONG (invalid JavaScript — will crash):
      .icon { background-image: url('sprite.png'); width: 50px; }
      function getStyles() { ... }
  - CORRECT (CSS as JS string values):
      function getSpritePosition(iconIndex) {
        // return a string like '-50px 0px'
        return '';
      }

The challenge must:
- Be solvable in under 30 minutes
- Require applying the core concept in a slightly new context
- Include a self-contained testRunner that prints PASS/FAIL lines
- Have 3 progressive hints

The testRunner must use this exact stdout protocol:
  PASS: <description>
  FAIL: <description> | got: <actual> | expected: <expected>

Return ONLY valid JSON:
{
  "language": "javascript",
  "title": "Challenge title",
  "description": "Clear description of what the user needs to do. For beginners: explain without assuming any programming knowledge.",
  "starterCode": "The code the user edits. For beginners: nearly complete, user fills in values. For advanced: function signature to implement.",
  "testRunner": "Self-contained code appended to user code that prints PASS/FAIL lines.",
  "hints": [
    "Hint 1 — gentle nudge",
    "Hint 2 — more specific",
    "Hint 3 — near-answer"
  ],
  "solution": "Full working solution"
}

LANGUAGE RULES for testRunner:

JavaScript/TypeScript — console.log PASS/FAIL:
  const r = solution(2, 3);
  if (r === 5) console.log("PASS: adds two numbers");
  else console.log(\`FAIL: adds two numbers | got: \${r} | expected: 5\`);

Python — print PASS/FAIL:
  r = solution(2, 3)
  if r == 5: print("PASS: adds two numbers")
  else: print(f"FAIL: adds two numbers | got: {r} | expected: 5")

Rust — fn main() that calls the function and prints PASS/FAIL:
  fn main() {
    let r = solution(2, 3);
    if r == 5 { println!("PASS: adds two numbers"); }
    else { println!("FAIL: adds two numbers | got: {} | expected: 5", r); }
  }

C/C++/Java/Go/other — same PASS/FAIL pattern using that language's print. testRunner must be a complete valid entry point appended to user code.`;

    const raw = await this._call(system, user);
    return this._parseJSON(raw);
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

    const raw = await this._call(system, user);
    return this._parseJSON(raw);
  }

  async chat(messages, summary, videoTitle) {
    const contextSection = summary
      ? `What was taught:\n${summary.summary}\n\nKey concepts:\n${(summary.keyPoints || []).join('\n')}`
      : 'No content summary available for this video.';
    const system = `You are a concise tutor helping a learner understand a video they just watched. Answer questions based on the video content summary. If the answer is not in the summary, say so. Keep answers to 2–3 sentences unless a longer explanation is clearly needed.\n\nVideo: "${videoTitle}"\n\n${contextSection}`;

    const res = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 512,
        system,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Anthropic API error ${res.status}: ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return { reply: data.content?.[0]?.text ?? '' };
  }
}
