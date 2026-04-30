/**
 * ui.js — Floating copilot panel for Scratch Copilot.
 * Uses Shadow DOM to avoid CSS conflicts with the Scratch editor.
 */
const ScratchCopilotUI = (() => {
  "use strict";

  let hostEl = null;
  let shadow = null;
  let chatBox = null;
  let promptInput = null;
  let isOpen = false;
  let isBusy = false;
  let vmReady = false;

  const HOST_ID = "scratch-copilot-host";

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    :host {
      all: initial;
      position: fixed;
      bottom: 9px;
      right: 200px;
      z-index: 2147483647;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #e2e8f0;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── FAB Button ── */
    #fab {
      width: 50px; height: 50px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
      border: none; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; cursor: pointer;
      box-shadow: 0 4px 20px rgba(99,102,241,0.4), 0 0 0 0 rgba(99,102,241,0);
      transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s;
      position: relative;
    }
    #fab:hover { transform: scale(1.12); box-shadow: 0 6px 28px rgba(99,102,241,0.5); }
    #fab:active { transform: scale(0.92); }
    #fab.open { border-radius: 16px; }

    /* ── Panel ── */
    #panel {
      position: absolute; bottom: 66px; right: 0;
      width: 420px; max-height: 580px;
      background: #0c1222;
      border: 1px solid rgba(99,102,241,0.2);
      border-radius: 20px;
      display: none; flex-direction: column;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.1);
    }
    #panel.open {
      display: flex;
      animation: panelIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
    }
    @keyframes panelIn {
      from { opacity: 0; transform: translateY(16px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ── Header ── */
    #hdr {
      padding: 14px 18px;
      background: linear-gradient(180deg, rgba(99,102,241,0.08), transparent);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex; align-items: center; justify-content: space-between;
    }
    #hdr-left { display: flex; align-items: center; gap: 10px; }
    #hdr-icon { font-size: 20px; filter: drop-shadow(0 0 6px rgba(99,102,241,0.5)); }
    #hdr-title { font-weight: 700; font-size: 14px; letter-spacing: -0.01em; }
    #hdr-right { display: flex; align-items: center; gap: 10px; }
    .hdr-btn {
      background: none; border: none; cursor: pointer;
      font-size: 14px; color: #64748b; padding: 2px;
      transition: color 0.2s;
    }
    .hdr-btn:hover { color: #e2e8f0; }

    /* Status dot */
    #status {
      width: 8px; height: 8px; border-radius: 50%;
      background: #64748b; transition: background 0.3s;
    }
    #status.ready { background: #4ade80; }
    #status.busy  { background: #818cf8; animation: pulse 1.2s ease-in-out infinite; }
    #status.error { background: #f87171; }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.5; transform: scale(1.4); }
    }

    /* ── Body ── */
    #body { display: flex; flex-direction: column; gap: 12px; padding: 14px 18px; flex: 1; overflow: hidden; }

    /* API Key config */
    #api-row {
      display: flex; gap: 8px;
      background: rgba(255,255,255,0.04); padding: 10px 12px; border-radius: 12px;
    }
    #api-row input {
      flex: 1; background: #1a2236; border: 1px solid #2d3a54; border-radius: 8px;
      color: #f1f5f9; font-size: 12px; padding: 7px 10px; outline: none;
      font-family: inherit;
    }
    #api-row input:focus { border-color: #6366f1; }

    /* Buttons */
    .btn {
      border: none; border-radius: 8px; padding: 7px 14px;
      font-size: 12px; font-weight: 600; cursor: pointer;
      font-family: inherit; transition: all 0.2s;
    }
    .btn-primary { background: #6366f1; color: #fff; }
    .btn-primary:hover { background: #5558e6; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Chat area */
    #chat {
      flex: 1; min-height: 0;
      background: #070d1a; border-radius: 12px;
      padding: 10px 12px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 4px;
      font-size: 12px; line-height: 1.5;
      max-height: 220px;
    }
    #chat::-webkit-scrollbar { width: 4px; }
    #chat::-webkit-scrollbar-thumb { background: #2d3a54; border-radius: 2px; }
    .m { padding: 3px 0; word-break: break-word; }
    .m-info    { color: #94a3b8; }
    .m-user    { color: #e2e8f0; font-weight: 500; }
    .m-success { color: #4ade80; }
    .m-error   { color: #f87171; }
    .m-ai      { color: #a5b4fc; }
    .m-system  { color: #fbbf24; font-style: italic; }

    /* Prompt */
    #prompt-wrap { position: relative; }
    #prompt {
      width: 100%; background: #1a2236;
      border: 1px solid #2d3a54; border-radius: 12px;
      color: #f8fafc; padding: 10px 44px 10px 12px;
      font-size: 13px; font-family: inherit; resize: none;
      outline: none; min-height: 44px; max-height: 120px;
      line-height: 1.4;
    }
    #prompt:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
    #prompt::placeholder { color: #475569; }
    #send {
      position: absolute; right: 8px; bottom: 7px;
      width: 30px; height: 30px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 15px;
      transition: transform 0.2s, opacity 0.2s;
    }
    #send:hover { transform: scale(1.1); }
    #send:active { transform: scale(0.9); }
    #send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

    /* Quick actions */
    #actions {
      display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
    }
    .act {
      background: #111a2e; border: 1px solid #1e2d48;
      color: #94a3b8; padding: 8px 10px; border-radius: 10px;
      font-size: 11px; font-family: inherit; font-weight: 500;
      display: flex; align-items: center; gap: 6px;
      cursor: pointer; transition: all 0.2s;
    }
    .act:hover { background: #1a2744; color: #e2e8f0; border-color: #334566; }
    .act:active { transform: scale(0.97); }
    .act span { font-size: 13px; }

    /* ── Loading dots ── */
    .loading { display: inline-flex; gap: 3px; padding: 4px 0; }
    .loading span {
      width: 5px; height: 5px; border-radius: 50%;
      background: #818cf8; animation: blink 1.4s infinite both;
    }
    .loading span:nth-child(2) { animation-delay: 0.2s; }
    .loading span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink {
      0%, 80%, 100% { opacity: 0.2; }
      40% { opacity: 1; }
    }
  `;

  /* ───── Build DOM ───── */

  function build(hasVM) {
    vmReady = hasVM;

    if (document.getElementById(HOST_ID)) return; // already built

    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    shadow = hostEl.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);

    // FAB
    const fab = el("button", { id: "fab" }, "🤖");
    shadow.appendChild(fab);

    // Panel
    const panel = el("div", { id: "panel" });
    panel.innerHTML = `
      <div id="hdr">
        <div id="hdr-left">
          <span id="hdr-icon">🤖</span>
          <span id="hdr-title">Scratch Copilot</span>
        </div>
        <div id="hdr-right">
          <button class="hdr-btn" id="btn-clear" title="Clear chat">🗑️</button>
          <div id="status"></div>
        </div>
      </div>
      <div id="body">
        <div id="api-row">
          <input id="api-input" type="password" placeholder="Paste your Gemini API key..." autocomplete="off" />
          <button class="btn btn-primary" id="btn-save-key">Save</button>
        </div>
        <div id="chat"></div>
        <div id="prompt-wrap">
          <textarea id="prompt" rows="1" placeholder="Describe what you want to build... (Ctrl+Enter)"></textarea>
          <button id="send">🚀</button>
        </div>
        <div id="actions">
          <button class="act" id="act-move"><span>🏃</span> Movement</button>
          <button class="act" id="act-game"><span>🎮</span> Full Game</button>
          <button class="act" id="act-flag"><span>🚩</span> Green Flag</button>
          <button class="act" id="act-inspect"><span>🔍</span> Inspect</button>
          <button class="act" id="act-clear"><span>🧹</span> Clear Project</button>
          <button class="act" id="act-stop"><span>🛑</span> Stop All</button>
          <button class="act" id="act-library"><span>📚</span> Browse Library</button>
          <button class="act" id="act-reset-key"><span>🔑</span> Reset API Key</button>
        </div>
      </div>
    `;
    shadow.appendChild(panel);

    chatBox = shadow.getElementById("chat");
    promptInput = shadow.getElementById("prompt");

    // ── Event Listeners ──

    fab.addEventListener("click", () => {
      isOpen = !isOpen;
      panel.classList.toggle("open", isOpen);
      fab.classList.toggle("open", isOpen);
      if (isOpen) promptInput.focus();
    });

    shadow.getElementById("btn-save-key").addEventListener("click", saveKey);
    shadow.getElementById("btn-clear").addEventListener("click", () => {
      chatBox.innerHTML = "";
      msg("Chat cleared.", "info");
    });
    shadow.getElementById("send").addEventListener("click", () => runPrompt());
    promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runPrompt(); }
    });
    promptInput.addEventListener("input", autoResize);

    // Quick actions
    shadow.getElementById("act-move").addEventListener("click", () => {
      setPrompt("Add arrow key movement (up/down/left/right) to the default sprite. Move 10 steps in each direction.");
      runPrompt();
    });
    shadow.getElementById("act-game").addEventListener("click", () => {
      setPrompt("Create a simple catch game: a player sprite at the bottom that moves left/right with arrow keys, and falling objects from the top. Keep score. When the player catches an object, increase score. If an object reaches the bottom, game over.");
      runPrompt();
    });
    shadow.getElementById("act-flag").addEventListener("click", () => {
      try { window.__scratchCopilotVM.greenFlag(); msg("▶ Green flag!", "success"); }
      catch (e) { msg(e.message, "error"); }
    });
    shadow.getElementById("act-stop").addEventListener("click", () => {
      try { window.__scratchCopilotVM.stopAll(); msg("⏹ Stopped.", "info"); }
      catch (e) { msg(e.message, "error"); }
    });
    shadow.getElementById("act-inspect").addEventListener("click", () => {
      try {
        const summary = window.__scratchCopilotVM.getProjectSummary();
        msg("📋 Project Summary:", "info");
        msg(summary, "ai");
      } catch (e) { msg(e.message, "error"); }
    });
    shadow.getElementById("act-clear").addEventListener("click", () => {
      try { window.__scratchCopilotVM.clearProject(); msg("🧹 Project cleared.", "success"); }
      catch (e) { msg(e.message, "error"); }
    });
    shadow.getElementById("act-library").addEventListener("click", () => {
      try {
        const names = window.__scratchCopilotVM.getLibraryNames();
        if (names.sprites.length === 0) {
          msg("Library not loaded yet. Please wait...", "error");
          return;
        }
        msg(`📚 Scratch Library Available:`, "info");
        msg(`Sprites (${names.sprites.length}): ${names.sprites.slice(0, 30).join(", ")}${names.sprites.length > 30 ? "..." : ""}`, "ai");
        msg(`Costumes (${names.costumes.length}): ${names.costumes.slice(0, 30).join(", ")}${names.costumes.length > 30 ? "..." : ""}`, "ai");
        msg(`Sounds (${names.sounds.length}): ${names.sounds.slice(0, 30).join(", ")}${names.sounds.length > 30 ? "..." : ""}`, "ai");
        msg(`Backdrops (${names.backdrops.length}): ${names.backdrops.slice(0, 20).join(", ")}${names.backdrops.length > 20 ? "..." : ""}`, "ai");
        msg(`Tip: Just describe what you want and the AI will automatically pick the best library assets!`, "system");
      } catch (e) { msg(e.message, "error"); }
    });
    shadow.getElementById("act-reset-key").addEventListener("click", () => {
      window.__scratchCopilotAI.clearApiKey();
      shadow.getElementById("api-row").style.display = "flex";
      msg("🔑 API key cleared. Enter a new one above.", "info");
    });

    document.body.appendChild(hostEl);

    // Welcome messages
    msg("Welcome to Scratch Copilot! 🚀", "system");
    if (!vmReady) {
      msg("⚠ Scratch VM not detected. Open a project in the editor for full functionality.", "error");
    } else {
      msg("Scratch VM connected ✓", "success");
    }
    // Show library status
    try {
      const names = window.__scratchCopilotVM.getLibraryNames();
      if (names.sprites.length > 0) {
        msg(`📚 Library loaded: ${names.sprites.length} sprites, ${names.costumes.length} costumes, ${names.sounds.length} sounds, ${names.backdrops.length} backdrops`, "success");
      }
    } catch (_) { }
    checkKey();
    setStatus("ready");
  }

  /* ───── Helpers ───── */

  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (text) e.textContent = text;
    return e;
  }

  function setPrompt(text) { promptInput.value = text; autoResize(); }

  function autoResize() {
    promptInput.style.height = "auto";
    promptInput.style.height = Math.min(promptInput.scrollHeight, 120) + "px";
  }

  function msg(text, type = "info") {
    const div = document.createElement("div");
    div.className = `m m-${type}`;
    if (typeof text === "object") {
      try { div.textContent = JSON.stringify(text, null, 2); }
      catch (_) { div.textContent = String(text); }
    } else {
      div.textContent = text;
    }
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
  }

  function addLoadingDots() {
    const div = document.createElement("div");
    div.className = "loading";
    div.id = "loading-dots";
    div.innerHTML = "<span></span><span></span><span></span>";
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
  }

  function removeLoadingDots() {
    const dots = shadow.getElementById("loading-dots");
    if (dots) dots.remove();
  }

  function setStatus(state) {
    const dot = shadow.getElementById("status");
    if (!dot) return;
    dot.className = "";
    if (state === "ready") dot.classList.add("ready");
    else if (state === "busy") dot.classList.add("busy");
    else if (state === "error") dot.classList.add("error");
  }

  /* ───── API Key ───── */

  function checkKey() {
    const key = window.__scratchCopilotAI.getApiKey();
    if (!key) {
      msg("Enter your Gemini API key above to get started.", "info");
    } else {
      msg("API key loaded ✓", "success");
      // Hide the key input row
      const row = shadow.getElementById("api-row");
      if (row) row.style.display = "none";
    }
  }

  function saveKey() {
    const input = shadow.getElementById("api-input");
    const key = input.value.trim();
    if (!key) { msg("Please enter an API key.", "error"); return; }
    window.__scratchCopilotAI.setApiKey(key);
    input.value = "";
    msg("API key saved ✓", "success");
    shadow.getElementById("api-row").style.display = "none";
  }

  /* ───── Run Prompt ───── */

  async function runPrompt() {
    const text = promptInput.value.trim();
    if (!text || isBusy) return;

    promptInput.value = "";
    autoResize();
    msg(`You: ${text}`, "user");

    isBusy = true;
    setStatus("busy");
    shadow.getElementById("send").disabled = true;

    const dots = addLoadingDots();

    try {
      // Check for API key
      const key = window.__scratchCopilotAI.getApiKey();
      if (!key) {
        throw new Error("NO_API_KEY");
      }

      // Get project context
      let context = null;
      try { context = window.__scratchCopilotVM.getProjectSummary(); } catch (_) { }

      // Query AI
      msg("🧠 Thinking...", "ai");
      const result = await window.__scratchCopilotAI.queryAI(text, context, (progress) => {
        // Could show streaming progress here
      });

      removeLoadingDots();
      msg("⚙ Applying changes...", "ai");

      // Apply the response
      const { log: applyLog, errors } = await window.__scratchCopilotVM.applyAIResponse(result);

      applyLog.forEach(l => msg(`✓ ${l}`, "success"));
      if (errors.length > 0) {
        errors.forEach(e => msg(`✗ ${e}`, "error"));
      }

      if (applyLog.length > 0 && errors.length === 0) {
        msg("Done! 🎉", "success");
      } else if (applyLog.length > 0) {
        msg("Completed with some warnings.", "system");
      }

      setStatus("ready");
    } catch (e) {
      removeLoadingDots();
      if (e.message === "NO_API_KEY") {
        msg("Please set your Gemini API key first.", "error");
        shadow.getElementById("api-row").style.display = "flex";
      } else if (e.message === "INVALID_API_KEY") {
        msg("Invalid API key. Please check and re-enter.", "error");
        window.__scratchCopilotAI.clearApiKey();
        shadow.getElementById("api-row").style.display = "flex";
      } else {
        msg(`Error: ${e.message}`, "error");
      }
      setStatus("error");
      // Reset status after a moment
      setTimeout(() => { if (!isBusy) setStatus("ready"); }, 3000);
    } finally {
      isBusy = false;
      shadow.getElementById("send").disabled = false;
    }
  }

  /* ───── Public API ───── */

  return { init: build };
})();

window.__scratchCopilotUI = ScratchCopilotUI;
