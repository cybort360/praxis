// background.js — Service Worker (Manifest V3)
// Manages side panel, message routing, and AI calls (keeps API key out of content scripts)

import { getAIProvider } from './ai/index.js';

function transcriptToPlainText(segments) {
  return segments.map(s => s.text).join(' ');
}

function transcriptToTimestamped(segments, maxChars = 6000) {
  let out = '';
  for (const seg of segments) {
    const t = Math.floor(seg.t);
    const line = `[t=${t}s] ${seg.text}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out;
}

// ── Message Router ──
// All messages from content.js and sidepanel go through here.
// This is intentional: the API key lives only in background, never exposed to page context.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    // Content script requests ytInitialPlayerResponse from the page's MAIN world.
    // chrome.scripting.executeScript with world:'MAIN' is exempt from the page's CSP,
    // unlike inline <script> injection which YouTube's nonce-based CSP blocks.
    case 'GET_PLAYER_DATA': {
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: 'MAIN',
        func: () => window.ytInitialPlayerResponse,
      })
        .then(([{ result }]) => sendResponse({ ok: true, data: result }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    // Content script found a video + transcript; store payload then open the panel.
    // The panel pulls from storage on load — avoids the race where sendMessage fires
    // before the panel's listener is attached.
    case 'VIDEO_DETECTED': {
      chrome.storage.session.set({ pendingSession: { ...message.payload, tabId: sender.tab.id } })
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

    case 'SEEK_VIDEO': {
      const { t, tabId } = message.payload;
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (seconds) => {
          const video = document.querySelector('video');
          if (video) video.currentTime = seconds;
        },
        args: [t],
      })
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
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
  const plainText = transcriptToPlainText(transcript);
  const timestampedText = transcriptToTimestamped(transcript);

  const [summary, quiz, challenge] = await Promise.all([
    ai.generateSummary(plainText, videoTitle),
    ai.generateQuiz(plainText, timestampedText, videoTitle),
    ai.generateChallenge(plainText, videoTitle),
  ]);

  return { summary, quiz, challenge };
}

async function handleEvaluateAnswer({ question, userAnswer, transcript }) {
  const ai = await getAIProvider();
  return ai.evaluateAnswer(question, userAnswer, transcript);
}
