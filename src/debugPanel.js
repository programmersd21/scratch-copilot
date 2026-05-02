/**
 * debugPanel.js
 * Visual inspector / debug panel injected into the extension UI.
 * Shows live project state, log stream, block tree health, and
 * provides quick actions for repair and export.
 */
(function () {
  "use strict";
  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("debugPanel") || console;

  let panel = null;
  let refreshTimer = null;

  function createPanel(shadowRoot) {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "debug-panel";
    panel.innerHTML = `
      <div class="dbg-header">
        <span>🔍 Debug Inspector</span>
        <button id="dbg-close" class="dbg-btn">✕</button>
      </div>
      <div class="dbg-tabs">
        <button class="dbg-tab active" data-tab="state">State</button>
        <button class="dbg-tab" data-tab="logs">Logs</button>
        <button class="dbg-tab" data-tab="health">Health</button>
        <button class="dbg-tab" data-tab="actions">Actions</button>
      </div>
      <div class="dbg-content" id="dbg-content"></div>
    `;
    shadowRoot.appendChild(panel);

    panel.querySelector("#dbg-close").addEventListener("click", () => hide());
    panel.querySelectorAll(".dbg-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        panel.querySelectorAll(".dbg-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        renderTab(tab.dataset.tab);
      });
    });

    return panel;
  }

  function getStyles() {
    return `
      #debug-panel {
        display: none; position: fixed; bottom: 96px; right: 460px;
        width: 380px; max-height: 520px; background: #0a0f1e;
        border: 1px solid rgba(99,102,241,0.3); border-radius: 12px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.6); z-index: 2147483645;
        font-family: 'Inter', system-ui, sans-serif; font-size: 12px;
        color: #e2e8f0; overflow: hidden; display: none;
        flex-direction: column; pointer-events: auto;
      }
      #debug-panel.visible { display: flex; }
      .dbg-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06);
        font-weight: 600; font-size: 13px;
        background: linear-gradient(180deg, rgba(99,102,241,0.1) 0%, transparent 100%);
      }
      .dbg-btn {
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        color: #94a3b8; cursor: pointer; border-radius: 6px; padding: 3px 8px;
        font-size: 12px; transition: background 0.2s;
      }
      .dbg-btn:hover { background: rgba(99,102,241,0.2); color: #e2e8f0; }
      .dbg-tabs {
        display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .dbg-tab {
        flex: 1; padding: 8px; text-align: center; background: none;
        border: none; color: #64748b; cursor: pointer; font-size: 11px;
        font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
        transition: color 0.2s, background 0.2s;
      }
      .dbg-tab:hover { color: #94a3b8; background: rgba(255,255,255,0.02); }
      .dbg-tab.active { color: #818cf8; border-bottom: 2px solid #6366f1; }
      .dbg-content {
        flex: 1; overflow-y: auto; padding: 12px; max-height: 380px;
      }
      .dbg-content::-webkit-scrollbar { width: 4px; }
      .dbg-content::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 2px; }
      .dbg-section { margin-bottom: 12px; }
      .dbg-section-title {
        font-size: 10px; font-weight: 700; color: #6366f1;
        text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;
      }
      .dbg-row {
        display: flex; justify-content: space-between; padding: 4px 0;
        border-bottom: 1px solid rgba(255,255,255,0.03);
      }
      .dbg-label { color: #94a3b8; }
      .dbg-value { color: #e2e8f0; font-weight: 600; font-family: 'Courier New', monospace; }
      .dbg-ok { color: #22c55e; } .dbg-warn { color: #f59e0b; } .dbg-err { color: #ef4444; }
      .dbg-log-entry {
        padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.02);
        font-family: 'Courier New', monospace; font-size: 11px; word-break: break-all;
      }
      .dbg-log-time { color: #475569; margin-right: 6px; }
      .dbg-log-level-info { color: #38bdf8; } .dbg-log-level-warn { color: #f59e0b; }
      .dbg-log-level-error { color: #ef4444; } .dbg-log-level-debug { color: #64748b; }
      .dbg-action-btn {
        display: block; width: 100%; padding: 8px 12px; margin-bottom: 6px;
        background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2);
        border-radius: 8px; color: #a5b4fc; cursor: pointer; font-size: 12px;
        text-align: left; transition: background 0.2s;
      }
      .dbg-action-btn:hover { background: rgba(99,102,241,0.2); }
    `;
  }

  function renderTab(tab) {
    const content = panel.querySelector("#dbg-content");
    content.innerHTML = "";
    switch (tab) {
      case "state": renderState(content); break;
      case "logs": renderLogs(content); break;
      case "health": renderHealth(content); break;
      case "actions": renderActions(content); break;
    }
  }

  function renderState(el) {
    try {
      const stats = SC.projectSerializer?.getProjectStats();
      const vm = SC.vmHook?.getVM();
      if (!stats || !vm) { el.textContent = "VM not connected"; return; }
      el.innerHTML = `
        <div class="dbg-section"><div class="dbg-section-title">Project Stats</div>
          <div class="dbg-row"><span class="dbg-label">Sprites</span><span class="dbg-value">${stats.spriteCount}</span></div>
          <div class="dbg-row"><span class="dbg-label">Total Blocks</span><span class="dbg-value">${stats.totalBlocks}</span></div>
          <div class="dbg-row"><span class="dbg-label">Variables</span><span class="dbg-value">${stats.totalVars}</span></div>
          <div class="dbg-row"><span class="dbg-label">Lists</span><span class="dbg-value">${stats.totalLists}</span></div>
          <div class="dbg-row"><span class="dbg-label">Costumes</span><span class="dbg-value">${stats.totalCostumes}</span></div>
          <div class="dbg-row"><span class="dbg-label">Sounds</span><span class="dbg-value">${stats.totalSounds}</span></div>
          <div class="dbg-row"><span class="dbg-label">Extensions</span><span class="dbg-value">${stats.extensions.join(", ") || "none"}</span></div>
        </div>
        <div class="dbg-section"><div class="dbg-section-title">Sprites</div>
          ${SC.spriteController?.listSprites().map(s => `
            <div class="dbg-row"><span class="dbg-label">${s.name}</span>
            <span class="dbg-value" style="font-size:10px">(${s.x},${s.y}) ${s.blockCount}blk</span></div>
          `).join("") || ""}
        </div>
      `;
    } catch (e) { el.textContent = `Error: ${e.message}`; }
  }

  function renderLogs(el) {
    const logs = SC.logger?.getBuffer() || [];
    const recent = logs.slice(-80).reverse();
    el.innerHTML = recent.map(e => `
      <div class="dbg-log-entry">
        <span class="dbg-log-time">${e.time}</span>
        <span class="dbg-log-level-${e.level}">[${e.level}]</span>
        <span>[${e.tag}]</span> ${e.message}
      </div>
    `).join("") || '<div style="color:#64748b">No logs yet</div>';
  }

  function renderHealth(el) {
    try {
      const vm = SC.vmHook?.getVM();
      if (!vm) { el.textContent = "VM not connected"; return; }
      let html = "";
      for (const t of vm.runtime.targets) {
        const name = t.isStage ? "Stage" : t.sprite.name;
        const result = SC.blockBuilder?.validateBlockTree(name);
        const cls = result?.valid ? "dbg-ok" : "dbg-err";
        html += `<div class="dbg-section"><div class="dbg-section-title">${name}</div>`;
        html += `<div class="dbg-row"><span class="dbg-label">Block Tree</span>
          <span class="dbg-value ${cls}">${result?.valid ? "✓ Valid" : `✗ ${result?.errors?.length} issue(s)`}</span></div>`;
        if (result?.errors?.length) {
          html += result.errors.slice(0, 5).map(e => `<div style="color:#f59e0b;font-size:11px;padding:2px 0">⚠ ${e}</div>`).join("");
        }
        html += `</div>`;
      }
      el.innerHTML = html;
    } catch (e) { el.textContent = `Error: ${e.message}`; }
  }

  function renderActions(el) {
    const actions = [
      { label: "🔧 Repair All Block Trees", fn: () => {
        const vm = SC.vmHook?.getVM(); if (!vm) return;
        let total = 0;
        for (const t of vm.runtime.targets) {
          total += SC.blockBuilder?.repairBlockTree(t.isStage ? "Stage" : t.sprite.name) || 0;
        }
        alert(`Repaired ${total} broken reference(s)`);
      }},
      { label: "💾 Export .sb3", fn: () => SC.projectSerializer?.exportSB3() },
      { label: "📋 Copy Project JSON", fn: () => {
        const json = SC.projectSerializer?.getProjectJSON();
        if (json) navigator.clipboard.writeText(json).then(() => alert("Copied!"));
      }},
      { label: "▶ Green Flag", fn: () => SC.vmHook?.greenFlag() },
      { label: "⏹ Stop All", fn: () => SC.vmHook?.stopAll() },
      { label: "🗑 Clear All Logs", fn: () => { SC.logger?.clearBuffer(); renderTab("logs"); }},
    ];
    el.innerHTML = actions.map(a =>
      `<button class="dbg-action-btn" data-action="${a.label}">${a.label}</button>`
    ).join("");
    el.querySelectorAll(".dbg-action-btn").forEach((btn, i) => {
      btn.addEventListener("click", () => { try { actions[i].fn(); } catch(e) { alert(`Error: ${e.message}`); }});
    });
  }

  function show(shadowRoot) {
    if (!panel) createPanel(shadowRoot);
    panel.classList.add("visible");
    renderTab("state");
    refreshTimer = setInterval(() => {
      const activeTab = panel.querySelector(".dbg-tab.active")?.dataset.tab;
      if (activeTab) renderTab(activeTab);
    }, 3000);
  }

  function hide() {
    if (panel) panel.classList.remove("visible");
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function toggle(shadowRoot) {
    if (panel?.classList.contains("visible")) hide(); else show(shadowRoot);
  }

  SC.debugPanel = { createPanel, show, hide, toggle, getStyles };
  log.info("debugPanel loaded");
})();
