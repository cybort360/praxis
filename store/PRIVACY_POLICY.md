# Praxis — Privacy Policy

**Last updated: May 2026**

## The short version

Praxis collects no personal data, runs no servers, and sends nothing to us. Ever.

---

## What Praxis does

Praxis is a Chrome extension that helps you learn from video tutorials. When you start a session on a supported video platform (YouTube, Udemy, etc.), it reads the video's captions, sends them to an AI provider of your choice (using your own API key), and generates a summary, quiz, and coding challenge inside the Chrome side panel.

---

## Data we collect

**Nothing.** Praxis has no backend, no analytics, no accounts, and no servers. We have no way to receive or store any information about you.

---

## Data stored on your device

Praxis stores the following data locally in your browser using the Chrome `storage` API. This data never leaves your device except as described below:

| Data | Where | Why |
|------|-------|-----|
| Your AI provider API key | `chrome.storage.local` | To make AI requests on your behalf |
| Session history (video titles, summaries, key points) | `chrome.storage.local` | To show your learning history |
| Learning stats (streak, session count) | `chrome.storage.local` | To show your progress |
| Current active session (transcript, quiz state) | `chrome.storage.session` | To restore your session if the panel closes |
| UI preferences (theme, settings) | `chrome.storage.local` | To remember your preferences |

You can delete all locally stored data at any time by clearing history inside the extension or uninstalling it.

---

## Data sent to third parties

When you use Praxis, the following data is sent **directly from your browser to the AI provider you configured** — not through us:

- The video transcript (captions)
- The video title
- Your quiz answers (for AI evaluation)
- Your chat messages

This request goes directly from your browser to the AI provider's API (Anthropic, OpenAI, Google Gemini, Groq, or OpenRouter) using the API key you provided. Praxis never sees or touches this data. Each provider's own privacy policy governs how they handle it.

When you run code in a non-JavaScript language, the code is sent to the **Piston API** (emkc.org) for execution. No personal data is included — only the code you wrote.

---

## Permissions explained

| Permission | Why it's needed |
|------------|-----------------|
| `sidePanel` | To display the Praxis learning panel alongside the video |
| `storage` | To save your API key, history, and settings locally |
| `scripting` | To read the video player's caption data and seek the video to a timestamp |
| `activeTab` | To interact with the current video tab when you start a session |
| Host access to YouTube, Udemy, etc. | To read captions and detect when a video is playing |
| Host access to AI provider URLs | To send your transcript to the AI provider you chose |
| Host access to emkc.org | To run non-JavaScript code (Python, Rust, etc.) via the Piston API |

---

## Children's privacy

Praxis is not directed at children under 13. We do not knowingly collect any information from children.

---

## Changes to this policy

If we make material changes to this policy, we will update the "Last updated" date above and release a new version of the extension.

---

## Contact

Questions? Open an issue at [github.com/your-username/praxis](https://github.com/your-username/praxis) or email [your@email.com].
