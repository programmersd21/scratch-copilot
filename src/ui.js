/**
 * ui.js
 * Floating Shadow DOM chat panel for Scratch Copilot.
 * Fully isolated from Scratch's own CSS.
 */

(function () {
  "use strict";

  // ─── Prevent double mount ────────────────────────────────────────────────
  if (document.getElementById("scratch-copilot-host")) return;

  // ─── State ───────────────────────────────────────────────────────────────
  let isOpen = false;
  let isProcessing = false;
  let activeRequestId = 0;
  let libraryNames = null;
  let shadowRoot = null;

  // DOM refs populated after mount
  let refs = {};

  // ─── CSS ─────────────────────────────────────────────────────────────────
  const STYLES = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :host {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 14px;
      color: #e2e8f0;
    }

    /* ── FAB ── */
    #fab {
      position: fixed;
      bottom: 9px;
      right: 200px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      box-shadow: 0 4px 20px rgba(99,102,241,0.55), 0 2px 8px rgba(0,0,0,0.4);
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 2147483647;
      outline: none;
      user-select: none;
      pointer-events: auto;
    }
    #fab:hover {
      transform: scale(1.1) rotate(5deg);
      box-shadow: 0 0 25px rgba(139,92,246,0.8), 0 2px 10px rgba(0,0,0,0.5);
    }
    #fab:active { transform: scale(0.92); }
    #fab.open { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); transform: scale(1) rotate(0deg); }
    
    #fab::after {
      content: "";
      position: absolute;
      top: -2px; left: -2px; right: -2px; bottom: -2px;
      border-radius: 50%;
      background: inherit;
      z-index: -1;
      opacity: 0.4;
      animation: fab-pulse 2s ease-out infinite;
    }

    @keyframes fab-pulse {
      0% { transform: scale(1); opacity: 0.4; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    /* ── Panel ── */
    #panel {
      position: fixed;
      bottom: 96px;
      right: 28px;
      width: 420px;
      max-height: 580px;
      background: #0c1222;
      border: 1px solid rgba(99,102,241,0.25);
      border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(99,102,241,0.1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483646;
      transform: translateY(24px) scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1),
                  opacity 0.25s ease;
      contain: layout style;
    }
    #panel.visible {
      transform: translateY(0) scale(1);
      opacity: 1;
      pointer-events: all;
    }

    /* ── Header ── */
    #header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      background: linear-gradient(180deg, rgba(99,102,241,0.12) 0%, transparent 100%);
      flex-shrink: 0;
    }
    #header-icon { font-size: 22px; flex-shrink: 0; }
    #header-title {
      font-weight: 700;
      font-size: 15px;
      color: #f1f5f9;
      flex: 1;
      letter-spacing: -0.01em;
    }
    #header-subtitle {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 1px;
    }
    .header-title-group { display: flex; flex-direction: column; flex: 1; }

    #status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      flex-shrink: 0;
      transition: background 0.3s ease;
    }
    #status-dot.busy {
      background: #f59e0b;
      animation: pulse-dot 1s ease-in-out infinite;
    }
    #status-dot.error { background: #ef4444; }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }

    .icon-btn {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      color: #94a3b8;
      cursor: pointer;
      padding: 5px 8px;
      font-size: 13px;
      transition: background 0.2s, color 0.2s;
      flex-shrink: 0;
      outline: none;
    }
    .icon-btn:hover { background: rgba(99,102,241,0.2); color: #e2e8f0; }

    /* ── Settings Panel ── */
    #settings-panel {
      display: none;
      padding: 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      background: rgba(99,102,241,0.05);
      flex-shrink: 0;
    }
    #settings-panel.open { display: block; }
    #settings-panel label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
    }
    .settings-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    #api-key-input {
      flex: 1;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      color: #e2e8f0;
      font-size: 13px;
      padding: 8px 10px;
      outline: none;
      font-family: 'Courier New', monospace;
      transition: border-color 0.2s;
    }
    #api-key-input:focus { border-color: #6366f1; }
    #api-key-input::placeholder { color: #475569; }
    #save-key-btn {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 14px;
      cursor: pointer;
      white-space: nowrap;
      transition: opacity 0.2s;
    }
    #save-key-btn:hover { opacity: 0.85; }
    .settings-hint {
      margin-top: 8px;
      font-size: 11px;
      color: #64748b;
      line-height: 1.5;
    }
    .settings-hint a { color: #818cf8; text-decoration: none; }
    .settings-hint a:hover { text-decoration: underline; }

    .action-btn {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 12px;
      cursor: pointer;
      transition: all 0.2s;
      flex: 1;
    }
    .action-btn:hover { background: rgba(255,255,255,0.1); }
    .action-btn.danger { color: #fca5a5; border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.1); }
    .action-btn.danger:hover { background: rgba(239,68,68,0.2); }

    /* ── Messages ── */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 14px 14px 8px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }
    #messages::-webkit-scrollbar { width: 4px; }
    #messages::-webkit-scrollbar-track { background: transparent; }
    #messages::-webkit-scrollbar-thumb {
      background: rgba(99,102,241,0.35);
      border-radius: 2px;
    }

    .msg {
      display: flex;
      gap: 8px;
      animation: msg-in 0.2s ease;
    }
    @keyframes msg-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      margin-top: 2px;
    }

    .msg.user { flex-direction: row-reverse; }
    .msg.user .msg-avatar {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
    }
    .msg.assistant .msg-avatar {
      background: linear-gradient(135deg, #0f172a, #1e293b);
      border: 1px solid rgba(99,102,241,0.3);
    }

    .msg-bubble {
      max-width: 82%;
      padding: 9px 12px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.55;
      word-break: break-word;
    }
    .msg.user .msg-bubble {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: #fff;
      border-bottom-right-radius: 3px;
    }
    .msg.assistant .msg-bubble {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid rgba(255,255,255,0.06);
      border-bottom-left-radius: 3px;
    }
    .msg.error .msg-bubble {
      background: rgba(239,68,68,0.12);
      border-color: rgba(239,68,68,0.25);
      color: #fca5a5;
    }
    .msg.success .msg-bubble {
      background: rgba(34,197,94,0.08);
      border-color: rgba(34,197,94,0.2);
      color: #86efac;
    }
    .msg.info .msg-bubble {
      background: rgba(99,102,241,0.08);
      border-color: rgba(99,102,241,0.2);
      color: #a5b4fc;
    }
    .msg-time {
      font-size: 10px;
      color: #475569;
      margin-top: 3px;
    }
    .msg.user .msg-time { text-align: right; }

    /* Steps list inside bubble */
    .steps {
      margin-top: 6px;
      padding-left: 14px;
      list-style: disc;
      font-size: 12px;
      color: #94a3b8;
    }
    .steps li { margin-top: 2px; }

    /* Loading dots */
    .loading-dots span {
      display: inline-block;
      width: 5px; height: 5px;
      border-radius: 50%;
      background: #6366f1;
      margin: 0 2px;
      animation: bounce-dot 1.2s ease-in-out infinite;
    }
    .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
    .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce-dot {
      0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
      40% { transform: scale(1.2); opacity: 1; }
    }

    /* ── Status bar ── */
    #status-bar {
      padding: 5px 14px;
      font-size: 11px;
      color: #64748b;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      min-height: 24px;
      flex-shrink: 0;
      transition: color 0.3s;
    }
    #status-bar.busy { color: #f59e0b; }
    #status-bar.error { color: #ef4444; }
    #status-bar.ok { color: #22c55e; }

    /* ── Input area ── */
    #input-area {
      display: flex;
      gap: 8px;
      padding: 12px 14px;
      border-top: 1px solid rgba(255,255,255,0.06);
      background: rgba(0,0,0,0.2);
      flex-shrink: 0;
      align-items: flex-end;
    }

    #prompt-input {
      flex: 1;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      color: #e2e8f0;
      font-size: 13px;
      font-family: inherit;
      padding: 9px 12px;
      resize: none;
      min-height: 38px;
      max-height: 120px;
      line-height: 1.4;
      outline: none;
      transition: border-color 0.2s, background 0.2s;
      overflow-y: auto;
    }
    #prompt-input:focus {
      border-color: #6366f1;
      background: rgba(99,102,241,0.05);
    }
    #prompt-input::placeholder { color: #475569; }
    #prompt-input:disabled { opacity: 0.5; cursor: not-allowed; }

    #send-btn {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none;
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.2s, transform 0.15s;
      outline: none;
    }
    #send-btn:hover:not(:disabled) { opacity: 0.85; transform: scale(1.05); }
    #send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── Empty state ── */
    #empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: 10px;
      color: #475569;
      text-align: center;
      padding: 20px;
    }
    #empty-state .es-icon { font-size: 40px; opacity: 0.5; }
    #empty-state .es-title { font-size: 14px; font-weight: 600; color: #64748b; }
    #empty-state .es-body { font-size: 12px; line-height: 1.5; }
    .example-prompt {
      display: inline-block;
      background: rgba(99,102,241,0.1);
      border: 1px solid rgba(99,102,241,0.2);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      color: #818cf8;
      margin: 3px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .example-prompt:hover { background: rgba(99,102,241,0.2); }
  `;

  // ─── HTML Template ───────────────────────────────────────────────────────

  const PANEL_HTML = `
    <div id="panel" role="dialog" aria-label="Scratch Copilot" aria-modal="true">

      <!-- Header -->
      <div id="header">
        <div id="header-icon">🚀</div>
        <div class="header-title-group">
          <div id="header-title">Scratch Copilot <span style="font-size:10px;vertical-align:middle;background:linear-gradient(90deg,#f59e0b,#ef4444);padding:1px 5px;border-radius:4px;color:white;margin-left:4px;letter-spacing:0.05em">PROFESSIONAL</span></div>
          <div id="header-subtitle">Advanced AI Project Architect</div>
        </div>
        <div id="status-dot" title="Ready"></div>
        <button class="icon-btn" id="settings-btn" title="Settings" aria-label="Settings">⚙️</button>
        <button class="icon-btn" id="close-btn" title="Close (Esc)" aria-label="Close panel">✕</button>
      </div>

      <!-- Settings -->
      <div id="settings-panel">
        <label for="api-key-input">Gemini API Key</label>
        <div class="settings-row">
          <input id="api-key-input" type="password"
            placeholder="AIza..." autocomplete="off" spellcheck="false"/>
          <button id="save-key-btn">Save Key</button>
        </div>
        <p class="settings-hint">
          Get a free key at
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">
            aistudio.google.com
          </a>.
          Your key is stored only in this browser.
        </p>
        <div style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px;">
          <label>Actions</label>
          <div class="settings-row">
            <button id="clear-chat-btn" class="action-btn">Clear Chat</button>
            <button id="clear-project-btn" class="action-btn danger">Clear Project</button>
          </div>
        </div>
      </div>

      <!-- Status Bar -->
      <div id="status-bar">Ready</div>

      <!-- Messages -->
      <div id="messages" role="log" aria-live="polite">
        <div id="empty-state">
          <div class="es-icon">✨</div>
          <div class="es-title">What shall we build?</div>
          <div class="es-body">
            Describe sprites, movements, sounds, or entire games.<br/>
            Try an example:
          </div>
          <div>
            <span class="example-prompt" data-prompt="Create a cat sprite that moves with arrow keys and bounces off edges">🐱 Arrow key cat</span>
            <span class="example-prompt" data-prompt="Add a space backdrop and a rocket sprite that flies upward">🚀 Space scene</span>
            <span class="example-prompt" data-prompt="Make a ball that bounces around and plays a sound when it hits the edge">🎵 Bouncing ball</span>
            <span class="example-prompt" data-prompt="Create a simple quiz game that asks the user their name and says hello">💬 Quiz game</span>
            <span class="example-prompt" data-prompt="Create a face-tracking game where a mask sprite follows my nose and changes costumes when I tilt my head">🎭 Face mask game</span>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div id="input-area">
        <textarea id="prompt-input" rows="1"
          placeholder="Describe what you want to create or change…"
          aria-label="Prompt input"></textarea>
        <button id="send-btn" aria-label="Send prompt" title="Send (Enter)">
          ➤
        </button>
      </div>
    </div>
  `;

  const FAB_HTML = `
    <button id="fab" aria-label="Open Scratch Copilot" title="Scratch Copilot">🤖</button>
  `;

  // ─── Mount ───────────────────────────────────────────────────────────────

  function mount() {
    // Host element in the real DOM
    const host = document.createElement("div");
    host.id = "scratch-copilot-host";
    host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;width:100vw;height:100vh;pointer-events:none;overflow:hidden;";
    document.body.appendChild(host);

    // Shadow DOM
    shadowRoot = host.attachShadow({ mode: "open" });

    // Inject style
    const styleEl = document.createElement("style");
    styleEl.textContent = STYLES;
    shadowRoot.appendChild(styleEl);

    // Load Inter font in the main doc
    if (!document.querySelector("#scratch-copilot-font")) {
      const link = document.createElement("link");
      link.id = "scratch-copilot-font";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap";
      document.head.appendChild(link);
    }

    // Inject HTML
    const wrapper = document.createElement("div");
    wrapper.innerHTML = FAB_HTML + PANEL_HTML;
    while (wrapper.firstChild) shadowRoot.appendChild(wrapper.firstChild);

    // Cache refs
    refs = {
      fab: shadowRoot.getElementById("fab"),
      panel: shadowRoot.getElementById("panel"),
      header: shadowRoot.getElementById("header"),
      statusDot: shadowRoot.getElementById("status-dot"),
      statusBar: shadowRoot.getElementById("status-bar"),
      settingsBtn: shadowRoot.getElementById("settings-btn"),
      settingsPanel: shadowRoot.getElementById("settings-panel"),
      closeBtn: shadowRoot.getElementById("close-btn"),
      apiKeyInput: shadowRoot.getElementById("api-key-input"),
      saveKeyBtn: shadowRoot.getElementById("save-key-btn"),
      clearChatBtn: shadowRoot.getElementById("clear-chat-btn"),
      clearProjectBtn: shadowRoot.getElementById("clear-project-btn"),
      messages: shadowRoot.getElementById("messages"),
      emptyState: shadowRoot.getElementById("empty-state"),
      promptInput: shadowRoot.getElementById("prompt-input"),
      sendBtn: shadowRoot.getElementById("send-btn"),
    };

    bindEvents();
    restoreApiKey();
    updateStatus("ready", "Ready");

    console.log("[Scratch Copilot] UI mounted");
  }

  // ─── Events ──────────────────────────────────────────────────────────────

  function bindEvents() {
    // FAB toggle
    refs.fab.addEventListener("click", togglePanel);

    // Close
    refs.closeBtn.addEventListener("click", closePanel);

    // Settings toggle
    refs.settingsBtn.addEventListener("click", () => {
      refs.settingsPanel.classList.toggle("open");
    });

    // Save API key
    refs.saveKeyBtn.addEventListener("click", saveApiKey);
    refs.apiKeyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveApiKey();
    });

    // Clear actions
    refs.clearChatBtn.addEventListener("click", () => {
      refs.messages.innerHTML = "";
      refs.messages.appendChild(refs.emptyState);
      refs.settingsPanel.classList.remove("open");
    });

    refs.clearProjectBtn.addEventListener("click", () => {
      if (!confirm("Are you sure you want to clear the entire Scratch project? This cannot be undone.")) return;
      const vm = window.ScratchCopilot?.vmHook?.getVM?.();
      if (vm) {
        vm.clear();
        window.ScratchCopilot?.vmHook?.safeEmitWorkspaceUpdate?.(vm);
        updateStatus("ok", "Project cleared");
        refs.settingsPanel.classList.remove("open");
      } else {
        showToast("Scratch VM not found", "error");
      }
    });

    // Send on Enter (Shift+Enter for newline)
    refs.promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Auto-grow textarea
    refs.promptInput.addEventListener("input", () => {
      refs.promptInput.style.height = "auto";
      refs.promptInput.style.height =
        Math.min(refs.promptInput.scrollHeight, 120) + "px";
    });

    // Send button
    refs.sendBtn.addEventListener("click", handleSend);

    // Escape key to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) closePanel();
    });

    // Example prompts
    shadowRoot.querySelectorAll(".example-prompt").forEach((el) => {
      el.addEventListener("click", () => {
        const prompt = el.dataset.prompt;
        if (prompt) {
          refs.promptInput.value = prompt;
          refs.promptInput.dispatchEvent(new Event("input"));
          refs.promptInput.focus();
        }
      });
    });
  }

  // ─── Panel Open/Close ────────────────────────────────────────────────────

  function togglePanel() {
    isOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    isOpen = true;
    refs.panel.classList.add("visible");
    refs.fab.classList.add("open");
    refs.fab.setAttribute("aria-label", "Close Scratch Copilot");
    setTimeout(() => refs.promptInput.focus(), 350);
  }

  function closePanel() {
    isOpen = false;
    refs.panel.classList.remove("visible");
    refs.fab.classList.remove("open");
    refs.fab.setAttribute("aria-label", "Open Scratch Copilot");
    if (refs.settingsPanel.classList.contains("open")) {
      refs.settingsPanel.classList.remove("open");
    }
  }

  // ─── API Key ─────────────────────────────────────────────────────────────

  function restoreApiKey() {
    const key = window.ScratchCopilot?.aiClient?.getApiKey?.() || "";
    if (key) {
      refs.apiKeyInput.value = key;
    }
  }

  function saveApiKey() {
    const val = refs.apiKeyInput.value.trim();
    if (!val) {
      showToast("Please enter an API key", "error");
      return;
    }
    window.ScratchCopilot?.aiClient?.setApiKey?.(val);
    refs.settingsPanel.classList.remove("open");
    showToast("API key saved ✓", "success");
    updateStatus("ready", "Ready");
  }

  // ─── Status ──────────────────────────────────────────────────────────────

  function updateStatus(state, text) {
    refs.statusDot.className = "";
    refs.statusBar.className = "";
    refs.statusBar.style.cursor = "default";
    refs.statusBar.onclick = null;

    if (state === "busy") {
      refs.statusDot.classList.add("busy");
      refs.statusBar.classList.add("busy");
    } else if (state === "error") {
      refs.statusDot.classList.add("error");
      refs.statusBar.classList.add("error");

      if (text.includes("VM not detected")) {
        refs.statusBar.innerHTML = `${text} — <span style="text-decoration:underline;cursor:pointer">Retry?</span>`;
        refs.statusBar.style.cursor = "pointer";
        refs.statusBar.onclick = () => {
          updateStatus("busy", "Retrying detection...");
          window.dispatchEvent(new CustomEvent("scratch-copilot-retry"));
        };
        return;
      }
    } else if (state === "ok") {
      refs.statusBar.classList.add("ok");
    }

    refs.statusBar.textContent = text;
  }

  function setProcessing(processing) {
    isProcessing = processing;
    refs.sendBtn.disabled = processing;
    refs.promptInput.disabled = processing;

    if (processing) {
      updateStatus("busy", "Processing…");
    } else {
      updateStatus("ready", "Ready");
    }
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  function addMessage(content, type = "assistant", steps = null) {
    // Remove empty state
    if (refs.emptyState && refs.emptyState.parentNode === refs.messages) {
      refs.messages.removeChild(refs.emptyState);
    }

    const now = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const msgEl = document.createElement("div");
    msgEl.className = `msg ${type}`;

    const isUser = type === "user";
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = isUser ? "👤" : "🤖";

    const right = document.createElement("div");

    const bubble = document.createElement("div");
    bubble.className = `msg-bubble`;
    bubble.textContent = content;

    if (steps && steps.length > 0) {
      const ul = document.createElement("ul");
      ul.className = "steps";
      steps.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        ul.appendChild(li);
      });
      bubble.appendChild(ul);
    }

    const timeEl = document.createElement("div");
    timeEl.className = "msg-time";
    timeEl.textContent = now;

    right.appendChild(bubble);
    right.appendChild(timeEl);
    right.style.flex = "1";
    right.style.minWidth = "0";

    if (isUser) {
      msgEl.appendChild(right);
      msgEl.appendChild(avatar);
    } else {
      msgEl.appendChild(avatar);
      msgEl.appendChild(right);
    }

    refs.messages.appendChild(msgEl);
    scrollToBottom();
    return msgEl;
  }

  function addLoadingMessage() {
    if (refs.emptyState && refs.emptyState.parentNode === refs.messages) {
      refs.messages.removeChild(refs.emptyState);
    }

    const msgEl = document.createElement("div");
    msgEl.className = "msg assistant";
    msgEl.id = "loading-msg";

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = "🤖";

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble loading-dots";
    bubble.innerHTML = "<span></span><span></span><span></span>";

    msgEl.appendChild(avatar);
    msgEl.appendChild(bubble);
    refs.messages.appendChild(msgEl);
    scrollToBottom();
    return msgEl;
  }

  function removeLoadingMessage() {
    const el = shadowRoot.getElementById("loading-msg");
    if (el) el.remove();
  }

  function showToast(text, type = "info") {
    addMessage(text, type);
  }

  function scrollToBottom() {
    refs.messages.scrollTop = refs.messages.scrollHeight;
  }

  // ─── Main Send Flow ───────────────────────────────────────────────────────

  async function handleSend() {
    if (isProcessing) return;

    const text = refs.promptInput.value.trim();
    if (!text) return;

    // Check API key
    if (!window.ScratchCopilot?.aiClient?.hasApiKey?.()) {
      refs.settingsPanel.classList.add("open");
      addMessage(
        "Please add your Gemini API key first (click ⚙️ or fill the field above).",
        "error"
      );
      return;
    }

    // Display user message
    addMessage(text, "user");
    refs.promptInput.value = "";
    refs.promptInput.style.height = "auto";
    setProcessing(true);
    const requestId = ++activeRequestId;

    // Watchdog: if something hangs (e.g. extension load never resolves),
    // re-enable the input so the UI doesn't get stuck disabled.
    const watchdog = setTimeout(() => {
      if (isProcessing && activeRequestId === requestId) {
        console.warn("[Scratch Copilot] Watchdog timeout; resetting processing state");
        removeLoadingMessage();
        addMessage("⚠ Operation timed out. UI was re-enabled — try again.", "error");
        updateStatus("error", "Timed out");
        setProcessing(false);
      }
    }, 45000);

    // Loading indicator
    addLoadingMessage();

    try {
      updateStatus("busy", "Asking Gemini AI…");

      // Gather project context
      const SC = window.ScratchCopilot;
      const vm = SC.vmHook?.getVM?.();
      const projectSummary = vm
        ? SC.vmHook.getProjectSummary()
        : null;

      const opcodeLibrary = vm
        ? SC.vmHook.getOpcodeLibrary()
        : null;

      // Call AI
      const plan = await SC.aiClient.sendPrompt(
        text,
        libraryNames,
        projectSummary,
        opcodeLibrary
      );

      removeLoadingMessage();

      // Apply the plan
      await applyPlan(plan, text);
    } catch (err) {
      removeLoadingMessage();
      console.error("[Scratch Copilot] Error:", err);
      addMessage(`Error: ${err.message}`, "error");
      updateStatus("error", `Error: ${err.message.slice(0, 60)}`);
    } finally {
      clearTimeout(watchdog);
      if (activeRequestId === requestId) setProcessing(false);
    }
  }

  // ─── Plan Execution ───────────────────────────────────────────────────────

  function normalisePrompt(text) {
    return String(text || "").toLowerCase();
  }

  function planHasOpcode(plan, prefix) {
    const needle = `"opcode":"${prefix}`;
    return JSON.stringify(plan.blocks || []).replace(/\s+/g, "").includes(needle);
  }

  function ensureAction(plan, extensionId) {
    plan.actions = Array.isArray(plan.actions) ? plan.actions : [];
    const hasIt = plan.actions.some(a =>
      a.type === "extension" &&
      (window.ScratchCopilot?.extensionLoader?.normaliseExtensionId?.(a.params?.extensionId) || a.params?.extensionId) === extensionId
    );
    if (!hasIt) plan.actions.unshift({ type: "extension", params: { extensionId } });
  }

  function chooseBlockSprite(plan) {
    const existingBlockSprite = plan.blocks?.find(b => b.spriteName)?.spriteName;
    if (existingBlockSprite) return existingBlockSprite;
    const existingSprite = plan.sprites?.find(s => s.name)?.name;
    if (existingSprite) return existingSprite;
    return "Sprite1";
  }

  function ensureSpriteForBlocks(plan, spriteName) {
    plan.sprites = Array.isArray(plan.sprites) ? plan.sprites : [];
    const hasSprite = plan.sprites.some(s => s.name === spriteName);
    const existing = window.ScratchCopilot?.vmHook?.findTargetByName?.(spriteName);
    if (!hasSprite && !existing && spriteName !== "Stage") {
      plan.sprites.push({ name: spriteName, libraryName: "Cat", x: 0, y: 0, size: 100, direction: 90 });
    }
  }

  function addScript(plan, spriteName, script) {
    plan.blocks = Array.isArray(plan.blocks) ? plan.blocks : [];
    let entry = plan.blocks.find(b => b.spriteName === spriteName);
    if (!entry) {
      entry = { spriteName, scripts: [] };
      plan.blocks.push(entry);
    }
    entry.scripts = Array.isArray(entry.scripts) ? entry.scripts : [];
    entry.scripts.push(script);
  }

  function translateLanguageCode(prompt) {
    if (/\bhindi\b|\bहिंदी\b/.test(prompt)) return "hi";
    if (/\bspanish\b/.test(prompt)) return "es";
    if (/\bfrench\b/.test(prompt)) return "fr";
    if (/\bgerman\b/.test(prompt)) return "de";
    if (/\bjapanese\b/.test(prompt)) return "ja";
    if (/\bchinese\b/.test(prompt)) return "zh-cn";
    return "hi";
  }

  function quotedText(prompt, fallback) {
    const match = String(prompt || "").match(/["'“‘]([^"'”’]+)["'”’]/);
    return match?.[1] || fallback;
  }

  function strengthenExtensionIntent(plan, userText) {
    const prompt = normalisePrompt(userText);
    if (!prompt) return plan;
    const wantsMusic = /\bmusic\b|\bbeat\b|\bdrum\b/.test(prompt);
    const wantsSpeech = /\bspeech\b|\bspeak\b|\bvoice\b|\btext\s*to\s*speech\b|\btts\b/.test(prompt);
    const wantsTranslate = /\btranslate\b|\btranslation\b/.test(prompt);
    const wantsFace = /\bface\b|\bnose\b|\beye\b|\bear\b/.test(prompt);

    if (wantsFace) {
      ensureAction(plan, "faceSensing");
      if (!planHasOpcode(plan, "faceSensing_")) {
        const spriteName = chooseBlockSprite(plan);
        ensureSpriteForBlocks(plan, spriteName);
        addScript(plan, spriteName, [
          { opcode: "event_whenflagclicked" },
          { opcode: "faceSensing_goToPart", inputs: { PART: [1, [1, "2"]] } },
          { opcode: "control_forever", inputs: {
            SUBSTACK: [
              { opcode: "faceSensing_goToPart", inputs: { PART: [1, [1, "2"]] } },
            ]
          }},
        ]);
      }
    }

    if (wantsMusic) {
      ensureAction(plan, "music");
      plan.sounds = [];
      if (!planHasOpcode(plan, "music_")) {
        const spriteName = chooseBlockSprite(plan);
        ensureSpriteForBlocks(plan, spriteName);
        addScript(plan, spriteName, [
          { opcode: "event_whenflagclicked" },
          { opcode: "music_setTempo", inputs: { TEMPO: [1, [4, 100]] } },
          {
            opcode: "control_forever", inputs: {
              SUBSTACK: [
                { opcode: "music_playDrumForBeats", inputs: { DRUM: [1, [4, 1]], BEATS: [1, [4, 0.25]] } },
                { opcode: "music_playDrumForBeats", inputs: { DRUM: [1, [4, 8]], BEATS: [1, [4, 0.25]] } },
                { opcode: "music_playNoteForBeats", inputs: { NOTE: [1, [4, 60]], BEATS: [1, [4, 0.5]] } },
              ]
            }
          },
        ]);
      }
    }

    if (wantsSpeech) {
      ensureAction(plan, "text2speech");
      if (!planHasOpcode(plan, "text2speech_")) {
        const spriteName = chooseBlockSprite(plan);
        ensureSpriteForBlocks(plan, spriteName);
        addScript(plan, spriteName, [
          { opcode: "event_whenflagclicked" },
          { opcode: "text2speech_setVoice", fields: { VOICE: ["alto", null] } },
          { opcode: "text2speech_speakAndWait", inputs: { WORDS: [1, [10, quotedText(userText, "Hello from Scratch")]] } },
        ]);
      }
    }

    if (wantsTranslate) {
      ensureAction(plan, "translate");
      if (!planHasOpcode(plan, "translate_")) {
        const spriteName = chooseBlockSprite(plan);
        ensureSpriteForBlocks(plan, spriteName);
        const language = translateLanguageCode(prompt);
        addScript(plan, spriteName, [
          { opcode: "event_whenflagclicked" },
          {
            opcode: "looks_sayforsecs",
            inputs: {
              MESSAGE: [2, {
                opcode: "translate_getTranslate",
                inputs: {
                  WORDS: [1, [10, quotedText(userText, "Hello")]],
                  LANGUAGE: [1, {
                    opcode: "translate_menu_languages",
                    fields: { LANGUAGE: [language, null] },
                    shadow: true,
                  }],
                },
              }],
              SECS: [1, [4, 2]],
            },
          },
        ]);
      }
    }

    return plan;
  }

  async function applyPlan(plan, userText = "") {
    plan = strengthenExtensionIntent(plan, userText);
    const SC = window.ScratchCopilot;
    const steps = [];
    const errors = [];
    const clearedSprites = new Set();
    try {
      SC.vmHook?.stopAll?.();
    } catch (_) {
      /* Non-fatal: continue applying structural changes. */
    }

    // 0. Handle clearBlocks FIRST
    for (const a of plan.actions || []) {
      if (a.type === "clearBlocks") {
        try {
          SC.blockBuilder.clearBlocks(a.spriteName);
          steps.push(`Cleared all blocks for "${a.spriteName}"`);
          clearedSprites.add(a.spriteName);
        } catch (e) {
          errors.push(`Action "clearBlocks": ${e.message}`);
        }
      }
    }

    // 0b. Pre-load extensions before any blocks reference them
    const neededExts = new Set();
    const inferredExts = SC.blockBuilder?.inferExtensionsFromScripts?.(plan.blocks || []) || [];
    inferredExts.forEach(ext => neededExts.add(ext));

    for (const a of plan.actions || []) {
      if (a.type === "extension" && a.params?.extensionId) {
        neededExts.add(SC.extensionLoader?.normaliseExtensionId?.(a.params.extensionId) || a.params.extensionId);
      }
    }

    for (const extId of neededExts) {
      try {
        updateStatus("busy", `Loading extension "${extId}"…`);
        await SC.extensionLoader.loadExtension(extId);
        steps.push(`Loaded extension "${extId}"`);
      } catch (e) {
        errors.push(`Extension "${extId}": ${e.message}`);
      }
    }

    // 0c. Sprite Lifecycle Actions
    for (const a of plan.actions || []) {
      try {
        if (a.type === "renameSprite") {
          SC.spriteController.renameSprite(a.spriteName, a.params?.newName);
          steps.push(`Renamed "${a.spriteName}" → "${a.params?.newName}"`);
        } else if (a.type === "deleteSprite") {
          SC.spriteController.deleteSprite(a.spriteName);
          steps.push(`Deleted sprite "${a.spriteName}"`);
        } else if (a.type === "duplicateSprite") {
          await SC.spriteController.duplicateSprite(a.spriteName);
          steps.push(`Duplicated sprite "${a.spriteName}"`);
        }
      } catch (e) {
        errors.push(`Action "${a.type}": ${e.message}`);
      }
    }

    // 1. Variables & Lists
    for (const v of plan.variables || []) {
      try {
        updateStatus("busy", `Creating variable "${v.name}"…`);
        SC.variableManager.createVariable(v.spriteName || "Stage", v.name, v.initialValue ?? 0);
        steps.push(`Created variable "${v.name}"`);
      } catch (e) {
        errors.push(`Variable "${v.name}": ${e.message}`);
      }
    }
    for (const l of plan.lists || []) {
      try {
        updateStatus("busy", `Creating list "${l.name}"…`);
        SC.variableManager.createList(l.spriteName || "Stage", l.name, l.initialValues || []);
        steps.push(`Created list "${l.name}"`);
      } catch (e) {
        errors.push(`List "${l.name}": ${e.message}`);
      }
    }

    // 2. Backdrops
    for (const b of plan.backdrops || []) {
      try {
        updateStatus("busy", `Adding backdrop "${b.libraryName}"…`);
        await SC.assetManager.addLibraryBackdrop(b.libraryName);
        steps.push(`Added backdrop "${b.libraryName}"`);
      } catch (e) {
        errors.push(`Backdrop "${b.libraryName}": ${e.message}`);
      }
    }

    // 3. Sprites
    for (const s of plan.sprites || []) {
      try {
        updateStatus("busy", `Adding sprite "${s.name}"…`);
        if (s.libraryName) {
          const newTarget = await SC.spriteController.addLibrarySprite(s.libraryName, s.name);
          const target = newTarget || SC.vmHook.findTargetByName(s.name) || SC.vmHook.findTargetByName(s.libraryName);
          if (target) {
            const actualName = target.sprite?.name || target.getName?.() || s.name;
            if (s.x !== undefined || s.y !== undefined) SC.vmHook.setSpritePosition(actualName, s.x ?? 0, s.y ?? 0);
            if (s.size !== undefined && s.size !== 100) SC.vmHook.setSpriteSize(actualName, s.size);
            if (s.direction !== undefined && s.direction !== 90) SC.vmHook.setSpriteDirection(actualName, s.direction);
            if (s.visible === false) SC.vmHook.setSpriteVisibility(actualName, false);
          }
          steps.push(`Added sprite "${s.libraryName}" as "${s.name}"`);
        } else {
          steps.push(`Skipped custom sprite "${s.name}" (no library asset)`);
        }
      } catch (e) {
        errors.push(`Sprite "${s.name}": ${e?.message || e}`);
      }
    }

    // 4. Costumes
    for (const c of plan.costumes || []) {
      try {
        updateStatus("busy", `Adding costume "${c.libraryName}"…`);
        await SC.assetManager.addLibraryCostume(c.spriteName, c.libraryName);
        steps.push(`Added costume "${c.libraryName}" to "${c.spriteName}"`);
      } catch (e) {
        errors.push(`Costume "${c.libraryName}": ${e.message}`);
      }
    }

    // 5. Sounds
    for (const s of plan.sounds || []) {
      try {
        updateStatus("busy", `Adding sound "${s.libraryName}"…`);
        await SC.assetManager.addLibrarySound(s.spriteName, s.libraryName);
        steps.push(`Added sound "${s.libraryName}" to "${s.spriteName}"`);
      } catch (e) {
        errors.push(`Sound "${s.libraryName}": ${e.message}`);
      }
    }

    // 6. Blocks
    for (const b of plan.blocks || []) {
      try {
        updateStatus("busy", `Injecting blocks for "${b.spriteName}"…`);
        if (b.scripts && b.scripts.length > 0) {
          await SC.blockBuilder.injectBlocks(b.spriteName, b.scripts);
          steps.push(`Injected ${b.scripts.length} script(s) into "${b.spriteName}"`);
        }
      } catch (e) {
        errors.push(`Blocks for "${b.spriteName}": ${e.message}`);
      }
    }

    // 7. Post-actions
    for (const a of plan.actions || []) {
      try {
        switch (a.type) {
          case "clearBlocks":
            if (!clearedSprites.has(a.spriteName)) {
              SC.blockBuilder.clearBlocks(a.spriteName);
              steps.push(`Cleared all blocks for "${a.spriteName}"`);
              clearedSprites.add(a.spriteName);
            }
            break;
          case "extension": break; // already handled
          case "greenFlag":
            steps.push("Skipped automatic green flag for safety");
            break;
          case "stop":
            SC.vmHook.stopAll();
            steps.push("⏹ Stopped all");
            break;
          case "setPosition":
            SC.vmHook.setSpritePosition(a.spriteName, a.params?.x ?? 0, a.params?.y ?? 0);
            steps.push(`Moved "${a.spriteName}" to (${a.params?.x}, ${a.params?.y})`);
            break;
          case "setSize":
            SC.vmHook.setSpriteSize(a.spriteName, a.params?.size ?? 100);
            steps.push(`Set "${a.spriteName}" size to ${a.params?.size}%`);
            break;
          case "setDirection":
            SC.vmHook.setSpriteDirection(a.spriteName, a.params?.direction ?? 90);
            steps.push(`Set "${a.spriteName}" direction to ${a.params?.direction}°`);
            break;
          case "setVisibility":
            SC.vmHook.setSpriteVisibility(a.spriteName, a.params?.visible !== false);
            steps.push(`Set "${a.spriteName}" ${a.params?.visible ? "visible" : "hidden"}`);
            break;
          case "deleteSprite":
          case "duplicateSprite":
          case "renameSprite":
            // Handled in step 0c
            break;
        }
      } catch (e) {
        errors.push(`Action "${a.type}": ${e.message}`);
      }
    }

    // Compose result message
    const allSteps = [...steps];
    if (errors.length > 0) {
      errors.forEach((e) => allSteps.push(`⚠ ${e}`));
    }

    const msgType = errors.length > 0 && steps.length === 0 ? "error" : "success";
    const intro = plan.message || "Done!";

    updateStatus(
      errors.length > 0 ? "error" : "ok",
      errors.length > 0 ? `Done with ${errors.length} warning(s)` : "Applied successfully"
    );

    addMessage(intro, msgType, allSteps.length > 0 ? allSteps : null);

    // Reset status after delay
    setTimeout(() => updateStatus("ready", "Ready"), 4000);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  function setLibraryNames(names) {
    libraryNames = names;
  }

  function showVmUnavailable() {
    addMessage(
      "⚠ Scratch VM not detected. Open a Scratch project in the editor first. Asset features are disabled.",
      "error"
    );
  }

  window.ScratchCopilot = window.ScratchCopilot || {};
  window.ScratchCopilot.ui = {
    mount,
    openPanel,
    closePanel,
    addMessage,
    updateStatus,
    setLibraryNames,
    showVmUnavailable,
  };

  console.log("[Scratch Copilot] ui.js loaded");
})();
