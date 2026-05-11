// background.js — Service Worker (Manifest V3)
// Manages side panel, message routing, and AI calls (keeps API key out of content scripts)

import { getAIProvider } from './ai/index.js';

// ── Side Panel: open automatically when user clicks the extension icon ──
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// ── Message Router ──
// All messages from content.js and sidepanel go through here.
// This is intentional: the API key lives only in background, never exposed to page context.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    // Content script found a video + transcript; store payload then open the panel.
    // The panel pulls from storage on load — avoids the race where sendMessage fires
    // before the panel's listener is attached.
    case 'VIDEO_DETECTED': {
      chrome.storage.session.set({ pendingSession: message.payload })
        .then(() => chrome.sidePanel.open({ tabId: sender.tab.id }))
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    // Side panel requests AI-generated summary + quiz + challenge
    case 'GENERATE_SESSION': {
      handleGenerateSession(message.payload)
        .then(result => sendResponse({ ok: true, data: result }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true; // keep channel open for async response
    }

    // Side panel requests AI to evaluate a free-text quiz answer
    case 'EVALUATE_ANSWER': {
      handleEvaluateAnswer(message.payload)
        .then(result => sendResponse({ ok: true, data: result }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    default:
      break;
  }
});

// ── AI Handlers ──

async function handleGenerateSession({ transcript, videoTitle }) {
  const ai = await getAIProvider();

  const [summary, quiz, challenge] = await Promise.all([
    ai.generateSummary(transcript, videoTitle),
    ai.generateQuiz(transcript, videoTitle),
    ai.generateChallenge(transcript, videoTitle),
  ]);

  return { summary, quiz, challenge };
}

async function handleEvaluateAnswer({ question, userAnswer, transcript }) {
  const ai = await getAIProvider();
  return ai.evaluateAnswer(question, userAnswer, transcript);
}
