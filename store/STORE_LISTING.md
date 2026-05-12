# Praxis — Chrome Web Store Listing

---

## Name
Praxis

## Short description (132 chars max)
Turn any tutorial video into a full learning session — AI summary, quiz, coding challenge, and tutor chat.

## Category
Education

## Language
English

---

## Detailed description

**Stop watching tutorials. Start actually learning.**

Most people watch tutorial videos and feel like they understood everything — then sit down to code and remember nothing. Praxis fixes that.

Praxis is a side panel that opens alongside any video on YouTube or Udemy. When you start a session, it reads the video's captions and uses AI to build a complete learning loop in seconds:

**📋 Smart Summary**
Get the key points of the video distilled into a clear summary and a bullet list of what was actually taught — not just a recap of what was said.

**📜 Full Transcript**
Browse the full transcript with timestamps. Click any line to jump straight to that moment in the video.

**🧠 Adaptive Quiz**
Three targeted questions — multiple choice, predict-the-output, and a free-text conceptual question. You need to pass 2 out of 3 to move on. The AI explains exactly what you got wrong.

**💻 Coding Challenge**
A real coding problem based on what the video taught. Write your solution in the built-in code editor, run it, and see PASS/FAIL test results instantly. Hints available if you're stuck.

**💬 AI Tutor Chat**
A floating chat bubble that lets you ask questions about the video at any time. "Wait, why did he use useCallback there?" — just ask.

**📊 Learning Streaks**
Track your daily learning streak, total sessions, and best streak in your history panel.

---

**Works on:**
- YouTube (all videos with captions)
- Udemy
- Coursera
- LinkedIn Learning
- Khan Academy
- Pluralsight
- Most other video platforms with subtitles

**Supports:**
- Anthropic Claude
- OpenAI GPT
- Google Gemini (free tier available — no credit card needed)
- Groq (fast, free tier)
- OpenRouter

**Your data stays on your device.** Praxis has no servers and collects no personal data. Your API key is stored locally in your browser and used only to make requests directly to the AI provider you choose.

---

## Single purpose statement
Praxis enhances video-based learning by generating AI-powered summaries, quizzes, and coding challenges from tutorial video captions — helping users retain and apply what they watch.

---

## Permission justifications (for the Developer Dashboard)

**sidePanel**
Required to display the Praxis learning panel as a Chrome side panel alongside the video the user is watching.

**storage**
Required to save the user's API key, session history, learning stats, and UI preferences locally on their device. No data is synced to any server.

**scripting**
Required for two purposes: (1) to read the YouTube player's internal caption track data (ytInitialPlayerResponse) from the page's JavaScript context, which cannot be accessed from an isolated content script; (2) to seek the video to a specific timestamp when the user clicks a transcript line in the panel.

**activeTab**
Required to interact with the currently active video tab — specifically, to inject the caption-reading and VTT-intercepting content scripts when the user starts a session.

**Host access to youtube.com / udemy.com / etc.**
Required to inject content scripts that detect when a video is playing and capture its caption/subtitle data so Praxis can generate learning content.

**Host access to AI provider APIs (anthropic, openai, generativelanguage, groq, openrouter)**
Required to send the video transcript to the AI provider the user configured (using their own API key) and receive the generated summary, quiz, and challenge. All requests go directly from the user's browser to their chosen provider — Praxis has no intermediary server.

**Host access to emkc.org**
Required to execute non-JavaScript code (Python, Rust, Go, etc.) via the Piston open-source code execution API when the user's coding challenge uses a language other than JavaScript.

---

## Screenshots needed (1280x800 or 640x400)

1. **Summary screen** — video playing on YouTube with the Praxis side panel open showing a summary and key points
2. **Quiz screen** — a multiple-choice question with one option selected
3. **Challenge screen** — the code editor with test results showing all PASS
4. **Transcript tab** — transcript with timestamps, showing clickable rows
5. **History screen** — the stats card (streak, best, sessions) above a list of past sessions
6. **Completion screen** — the celebration screen after passing the challenge

## Promotional tile (440x280)
Tagline: "Watch. Quiz. Build. Actually learn."
Show the Praxis logo + side panel UI mockup on a dark background.

---

## Store icon
Use `icons/icon128.png` — 128x128 RGBA PNG.
