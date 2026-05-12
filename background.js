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

    // Side panel wants to run code in a non-JS language via Piston API.
    // Piston is free, requires no API key, and supports 70+ languages.
    case 'EXECUTE_CODE': {
      const { language, code } = message.payload;
      fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, version: '*', files: [{ content: code }] }),
      })
        .then(r => r.json())
        .then(data => sendResponse({
          ok:       true,
          stdout:   data.run?.stdout   || '',
          stderr:   data.run?.stderr   || '',
          exitCode: data.run?.code     ?? -1,
        }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case 'CHAT_MESSAGE': {
      const { messages, summary, videoTitle } = message.payload;
      handleChat({ messages, summary, videoTitle })
        .then(result => sendResponse({ ok: true, data: result }))
        .catch(err  => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case 'FETCH_VTT': {
      // Content script fetch failed (CORS); retry from extension origin.
      fetch(message.payload.url)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .then(text => sendResponse({ ok: true, text }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true; // keep message channel open for async response
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

  // Generate summary first so quiz and challenge can use the compact summary
  // (~400 chars) instead of resending the full transcript (~8 000 chars each).
  const summary = await ai.generateSummary(plainText, videoTitle);

  // Quiz still needs the timestamped text for timestamp references.
  // Challenge uses the compact summary — much cheaper and still accurate.
  const [quiz, challenge] = await Promise.all([
    ai.generateQuiz(plainText, timestampedText, videoTitle),
    ai.generateChallenge(summary, videoTitle),
  ]);

  return { summary, quiz, challenge };
}

async function handleEvaluateAnswer({ question, userAnswer, summaryContext }) {
  const ai = await getAIProvider();
  return ai.evaluateAnswer(question, userAnswer, summaryContext);
}

async function handleChat({ messages, summary, videoTitle }) {
  const ai = await getAIProvider();
  return ai.chat(messages, summary, videoTitle);
}
