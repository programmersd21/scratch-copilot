/**
 * assetManager.js
 * Handles importing, converting, and linking costumes, sounds,
 * and backdrops from the Scratch library, URLs, base64, or raw buffers.
 */
(function () {
  "use strict";
  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("assetManager") || console;
  const hook = () => SC.vmHook;

  const IMAGE_VECTOR = new Set(["svg"]);

  function getStorageAssetType(vm, fmt, category) {
    const s = vm.runtime.storage;
    if (category === "sound") return s.AssetType.Sound;
    return IMAGE_VECTOR.has(fmt) ? s.AssetType.ImageVector : s.AssetType.ImageBitmap;
  }

  function makeAsset(vm, fmt, category, buffer, id) {
    const at = getStorageAssetType(vm, fmt, category);
    return vm.runtime.storage.createAsset(at, fmt, new Uint8Array(buffer), id, true);
  }

  function resolveAssetInfo(item, fallbackFormat) {
    const md5ext = item?.md5ext || item?.md5;
    if (!md5ext || typeof md5ext !== "string") {
      throw new Error(`Asset "${item?.name || "unknown"}" is missing md5ext`);
    }
    const assetId = item.assetId || md5ext.split(".")[0];
    const dataFormat = item.dataFormat || fallbackFormat || hook().dataFormatFromMd5ext(md5ext);
    return { md5ext, assetId, dataFormat };
  }

  async function addLibraryCostume(spriteName, costumeName) {
    const h = hook(); const vm = h.requireVM();
    const lib = await h.loadCostumeLibrary();
    const item = h.fuzzyFind(lib, costumeName);
    if (!item) throw new Error(`Costume "${costumeName}" not found in library`);
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const { md5ext, assetId, dataFormat: fmt } = resolveAssetInfo(item);
    const buf = await h.fetchAsset(md5ext);
    const asset = makeAsset(vm, fmt, "image", buf, assetId);
    await vm.addCostume(md5ext, {
      name: item.name, assetId, dataFormat: fmt, md5: md5ext, md5ext,
      rotationCenterX: item.rotationCenterX || 0, rotationCenterY: item.rotationCenterY || 0, asset,
    }, target.id);
    log.info(`Added costume "${item.name}" to "${spriteName}"`);
  }

  async function addLibrarySound(spriteName, soundName) {
    const h = hook(); const vm = h.requireVM();
    const lib = await h.loadSoundLibrary();
    const item = h.fuzzyFind(lib, soundName);
    if (!item) throw new Error(`Sound "${soundName}" not found in library`);
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const { md5ext, assetId, dataFormat: fmt } = resolveAssetInfo(item);
    const buf = await h.fetchAsset(md5ext);
    const asset = makeAsset(vm, fmt, "sound", buf, assetId);
    await vm.addSound({
      name: item.name, assetId, dataFormat: fmt, format: item.format || "", md5: md5ext, md5ext,
      sampleCount: item.sampleCount || 0, rate: item.rate || 44100, asset,
    }, target.id);
    log.info(`Added sound "${item.name}" to "${spriteName}"`);
  }

  async function addLibraryBackdrop(backdropName) {
    const h = hook(); const vm = h.requireVM();
    const lib = await h.loadBackdropLibrary();
    const item = h.fuzzyFind(lib, backdropName);
    if (!item) throw new Error(`Backdrop "${backdropName}" not found in library`);
    const { md5ext, assetId, dataFormat: fmt } = resolveAssetInfo(item);
    const buf = await h.fetchAsset(md5ext);
    const asset = makeAsset(vm, fmt, "image", buf, assetId);
    const stage = h.getStageTarget();
    if (!stage) throw new Error("Stage target not found. Cannot add backdrop.");
    await vm.addBackdrop(md5ext, {
      name: item.name, assetId, dataFormat: fmt, md5: md5ext, md5ext,
      rotationCenterX: item.rotationCenterX || 0, rotationCenterY: item.rotationCenterY || 0, asset,
    }, stage.id);
    log.info(`Added backdrop "${item.name}"`);
  }

  async function addCostumeFromURL(spriteName, url, costumeName) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch costume URL failed: HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const ext = url.split(".").pop().split("?")[0].toLowerCase() || "png";
    const fmt = IMAGE_VECTOR.has(ext) ? "svg" : "png";
    const id = h.uid(), md5ext = `${id}.${fmt}`;
    const asset = makeAsset(vm, fmt, "image", buffer, id);
    await vm.addCostume(md5ext, {
      name: costumeName || `costume-${id.slice(0,6)}`, assetId: id, dataFormat: fmt, md5: md5ext, md5ext,
      rotationCenterX: 0, rotationCenterY: 0, asset,
    }, target.id);
    log.info(`Added URL costume to "${spriteName}"`);
  }

  async function addSoundFromURL(spriteName, url, soundName) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch sound URL failed: HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const ext = url.split(".").pop().split("?")[0].toLowerCase() || "wav";
    const fmt = (ext === "mp3" || ext === "ogg") ? ext : "wav";
    const id = h.uid(), md5ext = `${id}.${fmt}`;
    const asset = makeAsset(vm, fmt, "sound", buffer, id);
    await vm.addSound({
      name: soundName || `sound-${id.slice(0,6)}`, assetId: id, dataFormat: fmt, format: "", md5: md5ext, md5ext,
      sampleCount: 0, rate: 44100, asset,
    }, target.id);
    log.info(`Added URL sound to "${spriteName}"`);
  }

  function deleteCostume(spriteName, idx) {
    const h = hook(); const vm = h.requireVM();
    const t = h.resolveTarget(spriteName);
    if (!t) throw new Error(`Sprite "${spriteName}" not found`);
    if (t.sprite.costumes.length <= 1) throw new Error("Cannot delete the only costume");
    if (idx < 0 || idx >= t.sprite.costumes.length) throw new Error(`Index ${idx} out of range`);
    vm.deleteCostume(t.id, idx);
    h.safeEmitWorkspaceUpdate(vm);
  }

  function deleteSound(spriteName, idx) {
    const h = hook(); const vm = h.requireVM();
    const t = h.resolveTarget(spriteName);
    if (!t) throw new Error(`Sprite "${spriteName}" not found`);
    if (idx < 0 || idx >= t.sprite.sounds.length) throw new Error(`Index ${idx} out of range`);
    vm.deleteSound(t.id, idx);
    h.safeEmitWorkspaceUpdate(vm);
  }

  function switchCostume(spriteName, nameOrIdx) {
    const h = hook();
    const t = h.resolveTarget(spriteName);
    if (!t) throw new Error(`Sprite "${spriteName}" not found`);
    if (typeof nameOrIdx === "number") { t.setCostume(nameOrIdx); return; }
    const idx = t.sprite.costumes.findIndex(c => h.normalise(c.name) === h.normalise(nameOrIdx));
    if (idx === -1) throw new Error(`Costume "${nameOrIdx}" not found`);
    t.setCostume(idx);
  }

  function getAllAssets(spriteName) {
    const h = hook();
    const t = h.resolveTarget(spriteName);
    if (!t) throw new Error(`Sprite "${spriteName}" not found`);
    return {
      costumes: t.sprite.costumes.map((c, i) => ({ index: i, name: c.name, format: c.dataFormat })),
      sounds: t.sprite.sounds.map((s, i) => ({ index: i, name: s.name, format: s.dataFormat })),
    };
  }

  SC.assetManager = {
    addLibraryCostume, addLibrarySound, addLibraryBackdrop,
    addCostumeFromURL, addSoundFromURL,
    deleteCostume, deleteSound, switchCostume, getAllAssets,
  };
  log.info("assetManager loaded");
})();
