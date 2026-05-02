/**
 * vmController.js
 * Thin facade used by the UI to control the Scratch VM via the
 * underlying modules (vmHook, blockBuilder, assetManager, etc).
 */
(function () {
  "use strict";

  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("vmController") || console;

  function requireModule(name, hint) {
    const mod = SC[name];
    if (!mod) throw new Error(`ScratchCopilot.${name} not loaded${hint ? ` (${hint})` : ""}`);
    return mod;
  }

  function hook() {
    return requireModule("vmHook", "manifest load order?");
  }

  function greenFlag() {
    hook().requireVM().greenFlag();
  }

  function stopAll() {
    hook().requireVM().stopAll();
  }

  function findTargetByName(name) {
    return hook().findTargetByName(name);
  }

  function resolveTarget(name) {
    return hook().resolveTarget(name);
  }

  function getStageTarget() {
    return hook().getStageTarget();
  }

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
    const vm = hook().requireVM();
    const t = resolveTarget(name);
    if (!t) return;
    if (layerChange === "front") vm.runtime.goToFront?.(t);
    else if (layerChange === "back") vm.runtime.goToBack?.(t);
  }

  function setSpriteRotationStyle(name, style) {
    const t = resolveTarget(name);
    if (!t) return;
    const valid = ["all around", "left-right", "don't rotate"];
    if (valid.includes(style)) t.setRotationStyle(style);
  }

  function setSpriteDraggable(name, draggable) {
    const t = resolveTarget(name);
    if (t) t.setDraggable(Boolean(draggable));
  }

  // ─── Variables ─────────────────────────────────────────────────────────

  function createVariable(spriteName, varName, initialValue = 0) {
    const vm = hook().requireVM();
    const target = resolveTarget(spriteName) || getStageTarget();
    if (!target) throw new Error(`Target "${spriteName}" not found`);

    // Prefer Scratch VM runtime helper when available, else fallback to direct map write.
    if (vm.runtime?.createVariable) {
      vm.runtime.createVariable(target.id, varName, "", false);
      // ensure initial value
      const v = Object.values(target.variables).find(
        (x) => x?.name === varName && (x.type === "" || x.type === "scalar" || !x.type)
      );
      if (v) v.value = initialValue;
      hook().safeEmitWorkspaceUpdate(vm);
      return;
    }

    requireModule("variableManager").createVariable(spriteName, varName, initialValue);
  }

  function setVariable(spriteName, varName, value) {
    requireModule("variableManager").setVariable(spriteName, varName, value);
  }

  function deleteVariable(spriteName, varName) {
    requireModule("variableManager").deleteVariable(spriteName, varName);
  }

  function listVariables(spriteName) {
    return requireModule("variableManager").listVariables(spriteName);
  }

  // ─── Assets & Blocks ───────────────────────────────────────────────────

  async function addLibraryBackdrop(name) {
    return requireModule("assetManager").addLibraryBackdrop(name);
  }

  async function addLibraryCostume(spriteName, costumeName) {
    return requireModule("assetManager").addLibraryCostume(spriteName, costumeName);
  }

  async function addLibrarySound(spriteName, soundName) {
    return requireModule("assetManager").addLibrarySound(spriteName, soundName);
  }

  async function addLibrarySprite(name, customName) {
    return requireModule("spriteController").addLibrarySprite(name, customName);
  }

  async function injectBlocks(spriteName, scripts) {
    return requireModule("blockBuilder").injectBlocks(spriteName, scripts);
  }

  function clearBlocks(spriteName) {
    return requireModule("blockBuilder").clearBlocks(spriteName);
  }

  // ─── Extensions ────────────────────────────────────────────────────────

  async function loadExtension(extensionId) {
    return requireModule("extensionLoader").loadExtension(extensionId);
  }

  SC.vmController = {
    // VM / targets
    findTargetByName,
    resolveTarget,
    getStageTarget,

    // playback
    greenFlag,
    stopAll,

    // sprite props
    setSpritePosition,
    setSpriteSize,
    setSpriteDirection,
    setSpriteVisibility,
    setSpriteLayer,
    setSpriteRotationStyle,
    setSpriteDraggable,

    // variables
    createVariable,
    setVariable,
    deleteVariable,
    listVariables,

    // assets / sprites
    addLibraryBackdrop,
    addLibrarySprite,
    addLibraryCostume,
    addLibrarySound,

    // blocks
    injectBlocks,
    clearBlocks,

    // extensions
    loadExtension,
  };

  log.info("vmController loaded");
})();

