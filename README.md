# LearnLoop

Watch tutorials. Get quizzed. Build. Actually learn.

## How to load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this `learnloop` folder
5. Click the LearnLoop icon in the toolbar → enter your API key and choose your AI provider
6. Go to any YouTube coding tutorial
7. The side panel opens automatically — work through the summary, quiz, and challenge

## Adding a new AI provider

1. Create `ai/yourprovider.js` extending `AIProvider` from `ai/provider.js`
2. Implement all 4 methods: `generateSummary`, `generateQuiz`, `generateChallenge`, `evaluateAnswer`
3. Import and add a `case` for it in `ai/index.js`
4. Add the option to the dropdown in `popup/index.html`

## File structure

```
learnloop/
├── manifest.json          # Manifest V3
├── background.js          # Service worker — AI calls live here (API key never in page context)
├── ai/
│   ├── provider.js        # Abstract base class — the contract every provider must follow
│   ├── anthropic.js       # Anthropic (Claude) implementation
│   ├── openai.js          # OpenAI (GPT) implementation
│   └── index.js           # Provider factory — reads config from chrome.storage
├── content/
│   └── content.js         # Injected into YouTube — detects video + extracts transcript
├── sidepanel/
│   ├── index.html         # Side panel shell
│   ├── style.css          # Dark theme UI
│   └── main.js            # Full learning loop: Summary → Quiz → Challenge + IDE
├── popup/
│   ├── index.html         # Settings popup
│   └── popup.js           # Save/load API key + provider choice
└── icons/
```

## The learning loop

**Step 1 — Summary**: AI reads the transcript and produces key points from the video.

**Step 2 — Quiz**: 3 questions (multiple choice, predict-output, free-text). You must engage before you can code.

**Step 3 — Challenge**: A coding problem in the built-in JS sandbox. Hints available. Solution locked behind a confirm dialog.
