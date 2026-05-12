// sidepanel/chat.js — AI chat module
// Exposes the Chat global. Loaded before main.js in index.html.
// Requires DOM elements: #chat-drawer, #chat-messages, #chat-input, #chat-send

const Chat = (() => {
  let _transcript  = '';
  let _videoTitle  = '';
  let _messages    = [];
  let _isOpen      = false;
  let _isLoading   = false;

  // ── Public API ────────────────────────────────────────────────────────────

  function init(transcript, videoTitle) {
    _transcript = Array.isArray(transcript)
      ? transcript.map(s => s.text).join(' ')
      : (transcript || '');
    _videoTitle  = videoTitle || '';
    _messages    = [];
    _isOpen      = false;
    _isLoading   = false;

    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-drawer').style.display = 'flex';
    document.body.classList.add('chat-visible');
    _setOpen(false);
  }

  function reset() {
    _transcript = '';
    _videoTitle = '';
    _messages   = [];
    _isOpen     = false;
    _isLoading  = false;

    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-drawer').style.display = 'none';
    document.body.classList.remove('chat-visible', 'chat-open');
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _setOpen(open) {
    _isOpen = open;
    document.getElementById('chat-drawer').classList.toggle('open', open);
    document.body.classList.toggle('chat-open', open);
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
    if (_isLoading || !_transcript) return;
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;

    input.value = '';
    _messages.push({ role: 'user', content: text });
    _appendBubble('user', text);

    if (!_isOpen) _setOpen(true);

    _isLoading    = true;
    input.disabled = true;
    const typingEl = _appendTypingIndicator();

    try {
      const resp = await chrome.runtime.sendMessage({
        type:    'CHAT_MESSAGE',
        payload: { messages: _messages, transcript: _transcript, videoTitle: _videoTitle },
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

  document.getElementById('chat-input').addEventListener('focus', () => {
    if (!_isOpen && _transcript) _setOpen(true);
  });

  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
  });

  document.getElementById('chat-send').addEventListener('click', () => _send());

  // Collapse when clicking outside the drawer
  document.addEventListener('click', e => {
    const drawer = document.getElementById('chat-drawer');
    if (_isOpen && !drawer.contains(e.target)) _setOpen(false);
  });

  // Collapse on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _isOpen) _setOpen(false);
  });

  return { init, reset };
})();
