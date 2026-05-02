/**
 * spriteController.js
 * High-level sprite lifecycle management: create, delete, duplicate,
 * rename, and transform sprites.
 */
(function () {
  "use strict";
  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("spriteCtrl") || console;
  const hook = () => SC.vmHook;

  async function addLibrarySprite(name, customName) {
    const h = hook(); const vm = h.requireVM();
    const library = await h.loadSpriteLibrary();
    const item = h.fuzzyFind(library, name) || library[0];
    const finalName = customName || item.name;
    const existing = h.findTargetByName(finalName);
    if (existing) return existing;

    const md5ext = item.md5ext || (item.costumes?.[0]?.md5ext);
    if (!md5ext) throw new Error(`No asset found for sprite "${name}"`);
    
    const fmt = h.dataFormatFromMd5ext(md5ext);
    const buf = await h.fetchAsset(md5ext);
    const assetId = md5ext.split(".")[0];
    const s = vm.runtime.storage;
    const at = fmt === "svg" ? s.AssetType.ImageVector : s.AssetType.ImageBitmap;
    const asset = s.createAsset(at, fmt, new Uint8Array(buf), assetId, true);

    const spriteJSON = {
      name: finalName, x: item.x || 0, y: item.y || 0, size: item.size || 100,
      direction: item.direction || 90, isDraggable: false, isStage: false, visible: true,
      costumes: [{
        name: item.name, assetId,
        dataFormat: fmt, md5ext,
        rotationCenterX: item.rotationCenterX || 0, rotationCenterY: item.rotationCenterY || 0,
        asset,
      }],
      sounds: [], blocks: {}, variables: {}, lists: {}, broadcasts: {}, comments: {},
      currentCostume: 0,
    };
    const tryAdd = async () => {
      let newTarget;
      try {
        newTarget = await vm.addSprite(spriteJSON);
      } catch (err) {
        throw new Error(`Failed to create sprite "${finalName}": ${err?.message || err}`);
      }
      if (!newTarget) throw new Error(`Failed to create sprite "${finalName}"`);
      return newTarget;
    };

    let newTarget;
    try {
      newTarget = await tryAdd();
    } catch (err) {
      // Scratch sometimes fails sprite creation transiently right after deletes/renames.
      // Retry once after a short delay, and if it still fails, surface the error.
      await new Promise((r) => setTimeout(r, 250));
      const nowExists = h.findTargetByName(finalName);
      if (nowExists) return nowExists;
      newTarget = await tryAdd();
    }

    // Add remaining costumes
    if (item.costumes?.length > 1) {
      for (let i = 1; i < item.costumes.length; i++) {
        try { await SC.assetManager.addLibraryCostume(finalName, item.costumes[i].name); }
        catch (_) { /* non-critical */ }
      }
    }
    log.info(`Added sprite "${finalName}" from library`);
    try { vm.setEditingTarget?.(newTarget.id); } catch (_) { /* ignore */ }
    return newTarget;
  }

  function deleteSprite(spriteName) {
    const h = hook(); const vm = h.requireVM();
    const target = h.findTargetByName(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    if (target.isStage) throw new Error("Cannot delete the Stage");
    vm.deleteSprite(target.id);
    h.safeEmitWorkspaceUpdate(vm);
    log.info(`Deleted sprite "${spriteName}"`);
  }

  async function duplicateSprite(spriteName) {
    const h = hook(); const vm = h.requireVM();
    const target = h.findTargetByName(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    if (target.isStage) throw new Error("Cannot duplicate the Stage");
    await vm.duplicateSprite(target.id);
    h.safeEmitWorkspaceUpdate(vm);
    log.info(`Duplicated sprite "${spriteName}"`);
  }

  function renameSprite(oldName, newName) {
    const h = hook(); const vm = h.requireVM();
    const target = h.findTargetByName(oldName);
    if (!target) throw new Error(`Sprite "${oldName}" not found`);
    if (target.isStage) throw new Error("Cannot rename the Stage");
    vm.renameSprite(target.id, newName);
    h.safeEmitWorkspaceUpdate(vm);
    log.info(`Renamed sprite "${oldName}" → "${newName}"`);
  }

  function selectSprite(spriteName) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    vm.setEditingTarget(target.id);
  }

  function listSprites() {
    const h = hook();
    return h.requireVM().runtime.targets
      .filter(t => !t.isStage)
      .map(t => ({
        name: t.sprite.name, x: t.x, y: t.y, size: t.size,
        direction: t.direction, visible: t.visible,
        costumeCount: t.sprite.costumes.length, soundCount: t.sprite.sounds.length,
        blockCount: Object.keys(t.blocks._blocks || {}).length,
      }));
  }

  function getSpriteDetails(spriteName) {
    const h = hook();
    const t = h.resolveTarget(spriteName);
    if (!t) throw new Error(`Sprite "${spriteName}" not found`);
    return {
      name: t.isStage ? "Stage" : t.sprite.name, isStage: t.isStage,
      x: t.x, y: t.y, size: t.size, direction: t.direction, visible: t.visible,
      draggable: t.draggable, rotationStyle: t.rotationStyle,
      currentCostume: t.currentCostume,
      costumes: t.sprite.costumes.map(c => c.name),
      sounds: t.sprite.sounds.map(s => s.name),
      variables: Object.values(t.variables).filter(v => !v.type || v.type === "scalar" || v.type === "")
        .map(v => ({ name: v.name, value: v.value })),
      lists: Object.values(t.variables).filter(v => v.type === "list")
        .map(v => ({ name: v.name, length: Array.isArray(v.value) ? v.value.length : 0 })),
      blockCount: Object.keys(t.blocks._blocks || {}).length,
    };
  }

  SC.spriteController = {
    addLibrarySprite, deleteSprite, duplicateSprite, renameSprite,
    selectSprite, listSprites, getSpriteDetails,
  };
  log.info("spriteController loaded");
})();
