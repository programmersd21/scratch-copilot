/**
 * vmHook.js
 * Low-level VM access layer. Detects the Scratch VM instance through
 * React fiber traversal, exposes it globally, and provides safe
 * helpers for emitting workspace updates without crashing.
 */

(function () {
  "use strict";

  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("vmHook") || console;

  // ─── Constants ──────────────────────────────────────────────────────────

  const CDN_BASE = "https://cdn.jsdelivr.net/npm/scratch-gui@5.3.0/dist/libraries";
  const ASSET_CDN = "https://assets.scratch.mit.edu/internalapi/asset";

  // ─── Utility ────────────────────────────────────────────────────────────

  function uid() {
    return Math.random().toString(36).slice(2, 12);
  }

  function normalise(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function fuzzyFind(items, query) {
    const q = normalise(query);
    let hit = items.find((i) => normalise(i.name) === q);
    if (hit) return hit;
    hit = items.find((i) => normalise(i.name).startsWith(q));
    if (hit) return hit;
    hit = items.find((i) => normalise(i.name).includes(q));
    if (hit) return hit;
    const compactQ = q.replace(/\s+/g, "");
    hit = items.find((i) => normalise(i.name).replace(/\s+/g, "") === compactQ);
    if (hit) return hit;
    const qTokens = q.split(/\s+/);
    let best = null,
      bestScore = 0;
    for (const item of items) {
      const iTokens = normalise(item.name).split(/\s+/);
      const score = qTokens.filter((t) => iTokens.includes(t)).length;
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return bestScore > 0 ? best : null;
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async function fetchAsset(md5ext) {
    const res = await fetch(`${ASSET_CDN}/${md5ext}/get/`);
    if (!res.ok) throw new Error(`Asset HTTP ${res.status} for ${md5ext}`);
    return res.arrayBuffer();
  }

  function dataFormatFromMd5ext(md5ext) {
    return (md5ext || "").split(".").pop().toLowerCase() || "png";
  }

  // ─── VM Access ──────────────────────────────────────────────────────────

  function getVM() {
    return (window.vm && window.vm.runtime) ? window.vm : (SC.vm || null);
  }

  function requireVM() {
    const vm = getVM();
    if (!vm) throw new Error("Scratch VM not available");
    return vm;
  }

  // ─── Target Lookup ──────────────────────────────────────────────────────

  function findTargetByName(name) {
    const vm = requireVM();
    const norm = normalise(name);
    if (norm === "stage") return getStageTarget();
    return (
      vm.runtime.targets.find((t) => !t.isStage && normalise(t.sprite.name) === norm) ||
      vm.runtime.targets.find((t) => !t.isStage && normalise(t.sprite.name).includes(norm)) ||
      null
    );
  }

  function getStageTarget() {
    return requireVM().runtime.targets.find((t) => t.isStage) || null;
  }

  function resolveTarget(name) {
    if (!name || name === "Stage" || name === "stage") return getStageTarget();
    return findTargetByName(name);
  }

  // ─── Safe Emit ──────────────────────────────────────────────────────────

  function repairPlainVariables(vm) {
    const targets = vm?.runtime?.targets || [];
    for (const target of targets) {
      if (!target?.variables || typeof target.createVariable !== "function") continue;
      for (const [id, variable] of Object.entries({ ...target.variables })) {
        if (!variable || typeof variable.toXML === "function") continue;
        const name = variable.name || "variable";
        const type = variable.type || "";
        const value = variable.value;
        const isCloud = Boolean(variable.isCloud);
        delete target.variables[id];
        target.createVariable(id, name, type, isCloud);
        if (target.variables[id]) target.variables[id].value = value;
      }
    }
  }

  function safeEmitWorkspaceUpdate(vm) {
    if (!vm) return false;
    let emitted = false;
    repairPlainVariables(vm);
    try {
      if (typeof vm.emitWorkspaceUpdate === "function") {
        vm.emitWorkspaceUpdate();
        emitted = true;
      }
    } catch (err) {
      log.warn?.("emitWorkspaceUpdate failed:", err.message || err);
    }
    try { vm.runtime?.setEditingTarget?.(vm.editingTarget); } catch (_) { /* swallow */ }
    try { vm.emitTargetsUpdate?.(false); } catch (_) { /* swallow */ }
    try { vm.runtime?.emitProjectChanged?.(); } catch (_) { /* swallow */ }
    try { vm.runtime?.emit?.("PROJECT_CHANGED"); } catch (_) { /* swallow */ }
    return emitted;
  }

  // ─── Library Cache ──────────────────────────────────────────────────────

  const _cache = { sprites: null, costumes: null, sounds: null, backdrops: null };

  async function loadSpriteLibrary() {
    if (!_cache.sprites) _cache.sprites = await fetchJSON(`${CDN_BASE}/sprites.json`);
    return _cache.sprites;
  }
  async function loadCostumeLibrary() {
    if (!_cache.costumes) _cache.costumes = await fetchJSON(`${CDN_BASE}/costumes.json`);
    return _cache.costumes;
  }
  async function loadSoundLibrary() {
    if (!_cache.sounds) _cache.sounds = await fetchJSON(`${CDN_BASE}/sounds.json`);
    return _cache.sounds;
  }
  async function loadBackdropLibrary() {
    if (!_cache.backdrops) _cache.backdrops = await fetchJSON(`${CDN_BASE}/backdrops.json`);
    return _cache.backdrops;
  }

  async function loadAllLibraries() {
    const [sprites, costumes, sounds, backdrops] = await Promise.all([
      loadSpriteLibrary(),
      loadCostumeLibrary(),
      loadSoundLibrary(),
      loadBackdropLibrary(),
    ]);
    return {
      spriteNames: sprites.map((s) => s.name),
      costumeNames: costumes.map((c) => c.name),
      soundNames: sounds.map((s) => s.name),
      backdropNames: backdrops.map((b) => b.name),
    };
  }

  // ─── Project Summary ────────────────────────────────────────────────────

  function getProjectSummary() {
    const vm = requireVM();
    return vm.runtime.targets.map((t) => ({
      name: t.isStage ? "Stage" : t.sprite.name,
      isStage: t.isStage,
      x: t.x,
      y: t.y,
      size: t.size,
      direction: t.direction,
      visible: t.visible,
      costumes: t.sprite.costumes.map((c) => c.name),
      sounds: t.sprite.sounds.map((s) => s.name),
      variables: Object.values(t.variables).map((v) => ({
        name: v.name,
        value: v.value,
        type: v.type || "scalar",
      })),
      lists: Object.values(t.variables)
        .filter((v) => v.type === "list")
        .map((v) => ({ name: v.name, length: Array.isArray(v.value) ? v.value.length : 0 })),
      blockCount: Object.keys(t.blocks._blocks || {}).length,
    }));
  }

  function getOpcodeLibrary() {
    const vm = getVM();
    if (!vm || !vm.runtime) return null;
    const rt = vm.runtime;
    const library = {
      core: {},
      extensions: {}
    };

    // Extract categories and blocks from the toolbox if possible, 
    // or fallback to _primitives and _blockInfo
    const primitives = Object.keys(rt._primitives || {});
    const blockInfo = rt.blockInfo || [];

    for (const info of blockInfo) {
      const category = info.id || "extension";
      if (!library.extensions[category]) library.extensions[category] = [];
      
      if (Array.isArray(info.blocks)) {
        for (const block of info.blocks) {
          if (typeof block === "object" && block.opcode) {
            library.extensions[category].push({
              opcode: `${category}_${block.opcode}`,
              text: block.text || "",
              arguments: block.arguments ? Object.keys(block.arguments) : []
            });
          }
        }
      }
    }

    // Core blocks usually don't have blockInfo entries in the same way,
    // they are often hardcoded in the GUI. However, we can group primitives by prefix.
    primitives.forEach(op => {
      const parts = op.split("_");
      if (parts.length < 2) return;
      const prefix = parts[0];
      if (["motion", "looks", "sound", "event", "control", "sensing", "operator", "data", "procedures"].includes(prefix)) {
        if (!library.core[prefix]) library.core[prefix] = [];
        library.core[prefix].push(op);
      }
    });

    return library;
  }

  // ─── Playback & Properties ──────────────────────────────────────────────

  function greenFlag() { requireVM().greenFlag(); }
  function stopAll() { requireVM().stopAll(); }

  function setSpritePosition(name, x, y) {
    const t = resolveTarget(name);
    if (t) t.setXY(Number(x), Number(y));
  }
  function setSpriteSize(name, size) {
    const t = resolveTarget(name);
    if (t) t.setSize(Number(size));
  }
  function setSpriteDirection(name, dir) {
    const t = resolveTarget(name);
    if (t) t.setDirection(Number(dir));
  }
  function setSpriteVisibility(name, visible) {
    const t = resolveTarget(name);
    if (t) t.setVisible(Boolean(visible));
  }
  function setSpriteLayer(name, layerChange) {
    const vm = requireVM();
    const t = resolveTarget(name);
    if (!t) return;
    if (layerChange === "front") {
      vm.runtime.goToFront?.(t);
    } else if (layerChange === "back") {
      vm.runtime.goToBack?.(t);
    }
  }
  function setSpriteRotationStyle(name, style) {
    const t = resolveTarget(name);
    if (!t) return;
    const validStyles = ["all around", "left-right", "don't rotate"];
    if (validStyles.includes(style)) t.setRotationStyle(style);
  }
  function setSpriteDraggable(name, draggable) {
    const t = resolveTarget(name);
    if (t) t.setDraggable(Boolean(draggable));
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  SC.vmHook = {
    // Core
    getVM,
    requireVM,
    uid,
    normalise,
    fuzzyFind,
    fetchJSON,
    fetchAsset,
    dataFormatFromMd5ext,

    // Targets
    findTargetByName,
    getStageTarget,
    resolveTarget,

    // Libraries
    loadSpriteLibrary,
    loadCostumeLibrary,
    loadSoundLibrary,
    loadBackdropLibrary,
    loadAllLibraries,

    // Blocks
    getOpcodeLibrary,

    // Updates
    safeEmitWorkspaceUpdate,

    // Properties
    getProjectSummary,
    greenFlag,
    stopAll,
    setSpritePosition,
    setSpriteSize,
    setSpriteDirection,
    setSpriteVisibility,
    setSpriteLayer,
    setSpriteRotationStyle,
    setSpriteDraggable,

    // Constants
    CDN_BASE,
    ASSET_CDN,
  };

  log.info?.("vmHook loaded");
})();
