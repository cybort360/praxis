// sidepanel/chat.js — AI chat module
// Exposes the Chat global. Loaded before main.js in index.html.
// Requires DOM elements: #chat-widget, #chat-popup, #chat-fab, #chat-close,
//                        #chat-messages, #chat-input, #chat-send

const Chat = (() => {
  let _summary    = null;
  let _videoTitle = '';
  let _messages   = [];
  let _isOpen     = false;
  let _isLoading  = false;

  // ── Public API ────────────────────────────────────────────────────────────

  // summary: { title, summary, keyPoints } — the already-generated session summary.
  // Using the compact summary (~400 chars) instead of the raw transcript (~6 000 chars)
  // cuts per-message token cost by ~15×.
  function init(summary, videoTitle) {
    _summary    = summary || null;
    _videoTitle = videoTitle || '';
    _messages   = [];
    _isOpen     = false;
    _isLoading  = false;

    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-widget').style.display = 'block';
    _setOpen(false);
  }

  function reset() {
    _summary    = null;
    _videoTitle = '';
    _messages   = [];
    _isOpen     = false;
    _isLoading  = false;

    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-widget').style.display = 'none';
    _setOpen(false);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _setOpen(open) {
    _isOpen = open;
    document.getElementById('chat-popup').classList.toggle('open', open);
    document.getElementById('chat-fab').classList.toggle('active', open);
  }

  function _appendBubble(role, text) {
    const msgList = document.getElementById('chat-messages');
    const div     = document.createElement('div');
    div.className = `chat-bubble chat-bubble-${role}`;
    div.textContent = text;
    msgList.appendChild(div);
    msgList.scrollTop = msgList.scrollHeight;
    return div;
  }

  function _appendTypingIndicator() {
    const msgList = document.getElementById('chat-messages');
    const div     = document.createElement('div');
    div.className = 'chat-bubble chat-bubble-assistant chat-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    msgList.appendChild(div);
    msgList.scrollTop = msgList.scrollHeight;
    return div;
  }

  async function _send() {
    if (_isLoading) return;
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;

    input.value = '';
    _messages.push({ role: 'user', content: text });
    _appendBubble('user', text);

    _isLoading     = true;
    input.disabled = true;
    const typingEl = _appendTypingIndicator();

    try {
      const resp = await chrome.runtime.sendMessage({
        type:    'CHAT_MESSAGE',
        payload: { messages: _messages, summary: _summary, videoTitle: _videoTitle },
      });

      typingEl.remove();
      _isLoading     = false;
      input.disabled = false;
      input.focus();

      if (resp?.ok) {
        const reply = resp.data.reply;
        _messages.push({ role: 'assistant', content: reply });
        _appendBubble('assistant', reply);
      } else {
        _appendBubble('assistant', 'Something went wrong — try again.');
      }
    } catch (err) {
      typingEl.remove();
      _isLoading     = false;
      input.disabled = false;
      _appendBubble('assistant', 'Something went wrong — try again.');
      console.error('[Praxis] Chat._send failed:', err);
    }
  }

  // ── DOM event wiring (runs once at script load, DOM is ready) ─────────────

  // FAB toggles the popup open/closed
  document.getElementById('chat-fab').addEventListener('click', () => {
    _setOpen(!_isOpen);
    if (_isOpen) document.getElementById('chat-input').focus();
  });

  // Close button collapses the popup
  document.getElementById('chat-close').addEventListener('click', () => _setOpen(false));

  // Send on Enter
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
  });

  // Send button
  document.getElementById('chat-send').addEventListener('click', () => _send());

  // Collapse when clicking outside the widget
  document.addEventListener('click', e => {
    const widget = document.getElementById('chat-widget');
    if (_isOpen && !widget.contains(e.target)) _setOpen(false);
  });

  // Collapse on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _isOpen) _setOpen(false);
  });

  return { init, reset };
})();
