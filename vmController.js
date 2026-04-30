/**
 * vmController.js — Interface to the Scratch VM.
 * Handles sprite creation, costume/sound addition, block injection, and project actions.
 */
const VMC = (() => {
  "use strict";
  let _vm = null;

  /* ───── Scratch Library Cache ───── */
  let _libraryCache = { sprites: null, costumes: null, sounds: null, backdrops: null };
  let _libraryLoading = null;
  const LIB_CDN = "https://cdn.jsdelivr.net/npm/scratch-gui@5.3.0/dist/libraries";

  async function loadLibrary() {
    if (_libraryCache.sprites) return _libraryCache;
    if (_libraryLoading) return _libraryLoading;
    _libraryLoading = (async () => {
      try {
        const [sprites, costumes, sounds, backdrops] = await Promise.all([
          fetch(`${LIB_CDN}/sprites.json`).then(r => r.ok ? r.json() : []),
          fetch(`${LIB_CDN}/costumes.json`).then(r => r.ok ? r.json() : []),
          fetch(`${LIB_CDN}/sounds.json`).then(r => r.ok ? r.json() : []),
          fetch(`${LIB_CDN}/backdrops.json`).then(r => r.ok ? r.json() : []),
        ]);
        _libraryCache = { sprites, costumes, sounds, backdrops };
        console.log(`[ScratchCopilot] Library loaded: ${sprites.length} sprites, ${costumes.length} costumes, ${sounds.length} sounds, ${backdrops.length} backdrops`);
      } catch (e) {
        console.warn("[ScratchCopilot] Library fetch failed:", e);
        _libraryCache = { sprites: [], costumes: [], sounds: [], backdrops: [] };
      }
      return _libraryCache;
    })();
    return _libraryLoading;
  }

  function getLibraryNames() {
    return {
      sprites: (_libraryCache.sprites || []).map(s => s.name),
      costumes: (_libraryCache.costumes || []).map(c => c.name),
      sounds: (_libraryCache.sounds || []).map(s => s.name),
      backdrops: (_libraryCache.backdrops || []).map(b => b.name),
    };
  }

  function findLibItem(list, name) {
    if (!list) return null;
    const lower = name.toLowerCase().trim();
    return list.find(i => i.name.toLowerCase() === lower)
      || list.find(i => i.name.toLowerCase().includes(lower))
      || null;
  }

  async function addLibrarySprite(libraryName) {
    const lib = await loadLibrary();
    const entry = findLibItem(lib.sprites, libraryName);
    if (!entry) throw new Error(`Library sprite "${libraryName}" not found`);
    const vm = getVM();
    await vm.addSprite(JSON.stringify(entry));
    return getTarget(entry.name);
  }

  async function addLibraryCostume(libraryName, targetName) {
    const lib = await loadLibrary();
    const entry = findLibItem(lib.costumes, libraryName);
    if (!entry) throw new Error(`Library costume "${libraryName}" not found`);
    const target = getTarget(targetName);
    if (!target) throw new Error(`Target "${targetName}" not found`);
    const md5 = entry.md5ext || entry.baseLayerMD5;
    const costume = {
      name: entry.name,
      md5ext: md5,
      dataFormat: md5.split('.').pop(),
      rotationCenterX: entry.rotationCenterX || 0,
      rotationCenterY: entry.rotationCenterY || 0,
      bitmapResolution: entry.bitmapResolution || 1
    };
    await getVM().addCostume(md5, costume, target.id);
    return costume;
  }

  async function addLibrarySound(libraryName, targetName) {
    const lib = await loadLibrary();
    const entry = findLibItem(lib.sounds, libraryName);
    if (!entry) {
        console.warn(`Library sound "${libraryName}" not found, skipping.`);
        return;
    }
    const target = getTarget(targetName);
    if (!target) return;
    const md5 = entry.md5ext || entry.md5;
    const sound = {
      name: entry.name,
      md5ext: md5,
      dataFormat: md5.split('.').pop(),
      rate: entry.rate || entry.sampleRate || 44100,
      sampleCount: entry.sampleCount || 0
    };
    await getVM().addSound(sound, target.id);
    return sound;
  }

  async function addLibraryBackdrop(libraryName) {
    const lib = await loadLibrary();
    const entry = findLibItem(lib.backdrops, libraryName);
    if (!entry) {
        console.warn(`Library backdrop "${libraryName}" not found, using default.`);
        return;
    }
    const stage = getTarget("Stage");
    if (!stage) return;
    const md5 = entry.md5ext || entry.baseLayerMD5;
    const costume = {
      name: entry.name,
      md5ext: md5,
      dataFormat: md5.split('.').pop(),
      rotationCenterX: entry.rotationCenterX || 240,
      rotationCenterY: entry.rotationCenterY || 180,
      bitmapResolution: entry.bitmapResolution || 1
    };
    await getVM().addCostume(md5, costume, stage.id);
    return costume;
  }

  /* ───── VM Access ───── */

  function setVM(vm) { _vm = vm; }

  function getVM() {
    if (_vm && _vm.runtime) return _vm;
    if (window.vm && window.vm.runtime) { _vm = window.vm; return _vm; }
    throw new Error("Scratch VM not available. Make sure you are on the Scratch editor page.");
  }

  function getRuntime() { return getVM().runtime; }

  function getTarget(name) {
    const rt = getRuntime();
    if (!name || name === "Stage") return rt.targets.find(t => t.isStage) || null;
    const matches = rt.targets.filter(t => !t.isStage && t.sprite && t.sprite.name === name);
    return matches.find(t => t.isOriginal) || matches[0] || null;
  }

  function getAllTargetNames() {
    return getRuntime().targets.map(t => ({
      name: t.sprite.name, isStage: t.isStage, id: t.id
    }));
  }

  /* ───── Project Summary ───── */

  function getProjectSummary() {
    const rt = getRuntime();
    const summary = { sprites: [], extensions: getLoadedExtensions() };
    for (const target of rt.targets) {
      summary.sprites.push({
        name: target.sprite.name,
        isStage: target.isStage,
        x: target.x, y: target.y,
        visible: target.visible,
        size: target.size,
        direction: target.direction,
        costumes: target.sprite.costumes.map(c => c.name),
        sounds: target.sprite.sounds.map(s => s.name),
        variables: Object.values(target.variables).map(v => ({ name: v.name, value: v.value })),
        lists: Object.values(target.variables).filter(v => v.type === "list").map(v => ({ name: v.name })),
        scriptCount: Object.values(target.blocks._blocks).filter(b => b.topLevel).length
      });
    }
    return JSON.stringify(summary, null, 2);
  }

  /* ───── Extensions ───── */

  function getLoadedExtensions() {
    const rt = getRuntime();
    return rt._loadedExtensions ? Array.from(rt._loadedExtensions.keys()) : [];
  }

  async function ensureExtension(extensionId) {
    const vm = getVM();
    const rt = vm.runtime;
    if (getLoadedExtensions().includes(extensionId)) return true;

    // Try finding the manager in multiple common Scratch locations
    const manager = rt.extensionManager || vm.extensionManager || window.extensionManager;
    
    if (manager) {
      try { 
        // Some versions use URL, others use ID. Try common patterns.
        const url = extensionId.startsWith("http") ? extensionId : `scratch3_${extensionId}`;
        await manager.loadExtensionURL(url);
        
        // Wait for registration
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true; 
      }
      catch (e) { 
        console.error(`Extension load error:`, e);
      }
    }
    throw new Error(`No extensionManager found to load "${extensionId}"`);
  }

  /* ───── Sprite Creation ───── */

  async function createSprite(spriteData) {
    const vm = getVM();
    const name = spriteData.name || `Sprite${Date.now()}`;
    const existing = getTarget(name);
    if (existing) return existing;

    const blankSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
    const svgBytes = new TextEncoder().encode(blankSvg);
    const storage = vm.runtime.storage;
    const costumeAsset = storage.createAsset(
      storage.AssetType.ImageVector, storage.DataFormat.SVG, svgBytes, null, true
    );

    const spriteJSON = {
      objName: name,
      sounds: [],
      costumes: [{
        costumeName: "costume1",
        baseLayerMD5: costumeAsset.assetId + ".svg",
        bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0
      }],
      currentCostumeIndex: 0,
      scratchX: spriteData.x || 0, scratchY: spriteData.y || 0,
      scale: (spriteData.size || 100) / 100,
      direction: spriteData.direction || 90,
      rotationStyle: "normal",
      isDraggable: false,
      visible: spriteData.visible !== false,
      spriteInfo: {}
    };

    await vm.addSprite(JSON.stringify(spriteJSON));

    // Apply costume if the AI provided custom SVG costumes
    const target = getTarget(name);
    if (target && spriteData.costumes && spriteData.costumes.length > 0) {
      for (const c of spriteData.costumes) {
        try { await addCostumeToSprite(name, c); } catch (_) { }
      }
    }
    return target;
  }

  /* ───── Costumes ───── */

  async function addCostumeToSprite(spriteName, costumeData) {
    const vm = getVM();
    const storage = vm.runtime.storage;
    const isVector = (costumeData.dataFormat || "svg") === "svg";
    const assetType = isVector ? storage.AssetType.ImageVector : storage.AssetType.ImageBitmap;
    const dataFormat = isVector ? storage.DataFormat.SVG : storage.DataFormat.PNG;

    let bytes;
    if (isVector) {
      let svgStr = costumeData.data || '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#4C97FF" rx="4"/></svg>';
      if (!svgStr.includes("xmlns")) {
        svgStr = svgStr.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      bytes = new TextEncoder().encode(svgStr);
    } else {
      const b64 = (costumeData.data || "").replace(/^data:[^;]+;base64,/, "");
      const raw = atob(b64);
      bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    }

    const asset = storage.createAsset(assetType, dataFormat, bytes, null, true);
    const target = getTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);

    const costume = {
      asset,
      name: costumeData.name || "costume",
      dataFormat: costumeData.dataFormat || "svg",
      assetId: asset.assetId,
      md5ext: `${asset.assetId}.${costumeData.dataFormat || "svg"}`,
      rotationCenterX: costumeData.rotationCenterX || 0,
      rotationCenterY: costumeData.rotationCenterY || 0
    };

    await vm.addCostume(costume.md5ext, costume, target.id);
    return costume;
  }

  /* ───── Sounds ───── */

  async function addSoundToSprite(spriteName, soundData) {
    const vm = getVM();
    const storage = vm.runtime.storage;
    const b64 = (soundData.data || "").replace(/^data:[^;]+;base64,/, "");
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    const fmt = soundData.dataFormat === "wav" ? storage.DataFormat.WAV : storage.DataFormat.MP3;
    const asset = storage.createAsset(storage.AssetType.Sound, fmt, bytes, null, true);
    const target = getTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);

    const sound = {
      asset,
      name: soundData.name || "sound",
      dataFormat: soundData.dataFormat || "mp3",
      assetId: asset.assetId,
      md5ext: `${asset.assetId}.${soundData.dataFormat || "mp3"}`,
      rate: soundData.rate || 44100,
      sampleCount: soundData.sampleCount || 0
    };

    await vm.addSound(sound, target.id);
    return sound;
  }

  /* ───── Block Injection ───── */

  /**
   * Primitive type → shadow opcode & field name mapping.
   * sb3 format: [shadowEnum, [primitiveType, value]]
   */
  const PRIM_MAP = {
    4: { opcode: "math_number", field: "NUM" },
    5: { opcode: "math_positive_number", field: "NUM" },
    6: { opcode: "math_integer", field: "NUM" },
    7: { opcode: "math_integer", field: "NUM" },
    8: { opcode: "math_angle", field: "NUM" },
    9: { opcode: "colour_picker", field: "COLOUR" },
    10: { opcode: "text", field: "TEXT" },
  };

  /** Known menu opcodes for field-based dropdown inputs. */
  const MENU_OPCODES = {
    "TOWARDS": "motion_goto_menu",
    "TO": "motion_goto_menu",
    "DISTANCETOMENU": "sensing_distancetomenu",
    "TOUCHINGOBJECTMENU": "sensing_touchingobjectmenu",
    "COSTUME": "looks_costume",
    "BACKDROP": "looks_backdrops",
    "SOUND_MENU": "sound_sounds_menu",
    "KEY_OPTION": "sensing_keyoptions",
    "BROADCAST_INPUT": "event_broadcast_menu",
    "CLONE_OPTION": "control_create_clone_of_menu",
    "OPERAND": "operator_mathop",
    "STOP_OPTION": "control_stop",
    "DRAG_MODE": "sensing_of_object_menu",
    "CURRENTMENU": "sensing_currentmenu",
    "PROPERTY": "sensing_of",
    "EFFECT": "looks_effectmenu",
    "CHANGE": "sound_effectmenu",
  };

  let _idCounter = 0;
  function genId() { return `_sc_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`; }

  /**
   * Convert sb3-style input value to runtime format,
   * creating shadow blocks as needed.
   *
   * sb3 input formats:
   *   [1, [primType, value]]          — shadow only
   *   [1, blockId]                     — direct block ref (shadow)
   *   [2, blockId]                     — no-shadow block ref
   *   [3, blockId, [primType, value]]  — block on top of shadow
   *   [1, [12, varName, varId]]        — variable
   *   [1, [13, listName, listId]]      — list
   */
  function convertInput(inputName, inputVal, parentId, target) {
    const extraBlocks = [];

    if (!Array.isArray(inputVal)) {
      // Not in sb3 array format — treat as a direct value
      const shadowId = genId();
      extraBlocks.push(makeShadowBlock(shadowId, 10, String(inputVal), parentId));
      return { input: { name: inputName, block: shadowId, shadow: shadowId }, extraBlocks };
    }

    const shadowEnum = inputVal[0]; // 1, 2, or 3
    const primary = inputVal[1];
    const fallback = inputVal[2]; // only for shadowEnum===3

    function handlePrimitive(primArr, asParent, iName) {
      if (!Array.isArray(primArr)) return null;
      const primType = primArr[0];

      // Variable reference [12, name, id]
      if (primType === 12) {
        const varName = primArr[1];
        let varId = primArr[2];
        if (!varId) varId = ensureVariable(target, varName);
        const sid = genId();
        extraBlocks.push({
          id: sid, opcode: "data_variable", next: null, parent: asParent,
          inputs: {}, fields: { VARIABLE: { name: "VARIABLE", value: varName, id: varId } },
          shadow: false, topLevel: false
        });
        return sid;
      }
      // List reference [13, name, id]
      if (primType === 13) {
        const listName = primArr[1];
        let listId = primArr[2];
        if (!listId) listId = ensureList(target, listName);
        const sid = genId();
        extraBlocks.push({
          id: sid, opcode: "data_listcontents", next: null, parent: asParent,
          inputs: {}, fields: { LIST: { name: "LIST", value: listName, id: listId } },
          shadow: false, topLevel: false
        });
        return sid;
      }
      // Broadcast [11, name, id]
      if (primType === 11) {
        const bName = primArr[1];
        let bId = primArr[2];
        if (!bId) bId = ensureBroadcast(target, bName);
        const sid = genId();
        extraBlocks.push({
          id: sid, opcode: "event_broadcast_menu", next: null, parent: asParent,
          inputs: {}, fields: { BROADCAST_OPTION: { name: "BROADCAST_OPTION", value: bName, id: bId } },
          shadow: true, topLevel: false
        });
        return sid;
      }
      // Normal primitive
      const sid = genId();
      extraBlocks.push(makeShadowBlock(sid, primType, String(primArr[1] ?? ""), asParent, iName));
      return sid;
    }

    if (Array.isArray(primary)) {
      // Primitive value
      const sid = handlePrimitive(primary, parentId, inputName);
      return { input: { name: inputName, block: sid, shadow: sid }, extraBlocks };
    }

    if (typeof primary === "string") {
      // Block reference
      if (shadowEnum === 3 && Array.isArray(fallback)) {
        const sid = handlePrimitive(fallback, parentId, inputName);
        return { input: { name: inputName, block: primary, shadow: sid }, extraBlocks };
      }
      // SUBSTACK or plain block ref
      if (inputName === "SUBSTACK" || inputName === "SUBSTACK2" || inputName === "CONDITION" || inputName === "OPERAND1" || inputName === "OPERAND2") {
        return { input: { name: inputName, block: primary, shadow: null }, extraBlocks };
      }
      return { input: { name: inputName, block: primary, shadow: primary }, extraBlocks };
    }

    // Fallback — just create a text shadow
    const sid = genId();
    extraBlocks.push(makeShadowBlock(sid, 10, "", parentId, inputName));
    return { input: { name: inputName, block: sid, shadow: sid }, extraBlocks };
  }

  function makeShadowBlock(id, primType, value, parentId, inputName) {
    let opcode, field;
    if (inputName && MENU_OPCODES[inputName]) {
      opcode = MENU_OPCODES[inputName];
      field = inputName;
    } else {
      const info = PRIM_MAP[primType] || PRIM_MAP[10];
      opcode = info.opcode;
      field = info.field;
    }
    return {
      id, opcode, next: null, parent: parentId,
      inputs: {},
      fields: { [field]: { name: field, value: value } },
      shadow: true, topLevel: false
    };
  }

  /* ─── Variable / List / Broadcast helpers ─── */

  function ensureVariable(target, varName) {
    const existing = Object.entries(target.variables).find(([, v]) => v.name === varName && v.type !== "list");
    if (existing) return existing[0];
    const stage = getRuntime().targets.find(t => t.isStage);
    if (stage) {
      const stageVar = Object.entries(stage.variables).find(([, v]) => v.name === varName && v.type !== "list");
      if (stageVar) return stageVar[0];
    }
    const id = `var_${varName}_${Date.now()}`;
    target.createVariable(id, varName, "");
    return id;
  }

  function ensureList(target, listName) {
    const existing = Object.entries(target.variables).find(([, v]) => v.name === listName && v.type === "list");
    if (existing) return existing[0];
    const id = `list_${listName}_${Date.now()}`;
    target.createVariable(id, listName, "list");
    return id;
  }

  function ensureBroadcast(target, bName) {
    const stage = getRuntime().targets.find(t => t.isStage);
    const t = stage || target;
    // Broadcasts live as stage variables of type "broadcast_msg"
    const existing = Object.entries(t.variables).find(([, v]) => v.name === bName && v.type === "broadcast_msg");
    if (existing) return existing[0];
    const id = `broadcast_${bName}_${Date.now()}`;
    t.createVariable(id, bName, "broadcast_msg");
    return id;
  }

  /* ─── The main block injection function ─── */

  function injectBlocks(spriteName, scripts) {
    const target = getTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);

    const blocks = target.blocks;

    function processBlockSequence(blockArray, parentId = null, topLevel = false, scriptX = 0, scriptY = 0) {
      if (!Array.isArray(blockArray) || blockArray.length === 0) return null;

      // First pass: generate IDs and link next/parent
      for (let i = 0; i < blockArray.length; i++) {
        const b = blockArray[i];
        if (!b.id) b.id = genId();
        b.topLevel = topLevel && i === 0;
        b.parent = i === 0 ? parentId : blockArray[i - 1].id;
        b.next = i < blockArray.length - 1 ? (blockArray[i + 1].id || (blockArray[i + 1].id = genId())) : null;
      }

      // Second pass: Process each block
      for (let i = 0; i < blockArray.length; i++) {
        const b = blockArray[i];
        const allExtra = [];
        const runtimeInputs = {};

        // Convert sb3 inputs → runtime inputs + create shadow blocks
        if (b.inputs) {
          for (const [inputName, inputVal] of Object.entries(b.inputs)) {
            // Check if input is a nested block (CONDITION)
            if (Array.isArray(inputVal) && inputVal.length === 2 && inputVal[0] === 2 && typeof inputVal[1] === "object" && !Array.isArray(inputVal[1])) {
              const condBlock = inputVal[1];
              condBlock.id = genId();
              processBlockSequence([condBlock], b.id, false);
              runtimeInputs[inputName] = { name: inputName, block: condBlock.id, shadow: null };
            }
            // Check if input is a nested array (SUBSTACK / SUBSTACK2)
            else if (Array.isArray(inputVal) && inputName.startsWith("SUBSTACK")) {
              const firstId = processBlockSequence(inputVal, b.id, false);
              if (firstId) {
                runtimeInputs[inputName] = { name: inputName, block: firstId, shadow: null };
              }
            } else {
              // Normal input processing
              const { input, extraBlocks } = convertInput(inputName, inputVal, b.id, target);
              runtimeInputs[inputName] = input;
              allExtra.push(...extraBlocks);
            }
          }
        }

        // Convert fields
        const runtimeFields = {};
        if (b.fields) {
          for (const [fieldName, fieldVal] of Object.entries(b.fields)) {
            if (Array.isArray(fieldVal)) {
              runtimeFields[fieldName] = { name: fieldName, value: fieldVal[0], id: fieldVal[1] || null };
            } else if (typeof fieldVal === "object" && fieldVal !== null) {
              runtimeFields[fieldName] = { name: fieldName, value: fieldVal.value || fieldVal.name || "", id: fieldVal.id || null };
            } else {
              runtimeFields[fieldName] = { name: fieldName, value: String(fieldVal), id: null };
            }
          }
        }

        // Handle variable/list fields — ensure IDs exist
        if (runtimeFields.VARIABLE && !runtimeFields.VARIABLE.id) {
          runtimeFields.VARIABLE.id = ensureVariable(target, runtimeFields.VARIABLE.value);
        }
        if (runtimeFields.LIST && !runtimeFields.LIST.id) {
          runtimeFields.LIST.id = ensureList(target, runtimeFields.LIST.value);
        }
        if (runtimeFields.BROADCAST_OPTION && !runtimeFields.BROADCAST_OPTION.id) {
          runtimeFields.BROADCAST_OPTION.id = ensureBroadcast(target, runtimeFields.BROADCAST_OPTION.value);
        }

        // Create shadow/menu blocks first
        for (const extra of allExtra) {
          blocks.createBlock(extra);
        }

        // Create the main block
        blocks.createBlock({
          id: b.id,
          opcode: b.opcode,
          next: b.next,
          parent: b.parent,
          inputs: runtimeInputs,
          fields: runtimeFields,
          shadow: b.shadow || false,
          topLevel: b.topLevel,
          x: b.topLevel ? scriptX : undefined,
          y: b.topLevel ? scriptY : undefined,
          mutation: b.mutation || undefined
        });
      }

      return blockArray[0].id;
    }

    // Resilient parsing: If scripts is just an array of block objects instead of an array of arrays, wrap it.
    let parsedScripts = scripts;
    if (Array.isArray(scripts) && scripts.length > 0 && !Array.isArray(scripts[0]) && !scripts[0].blocks) {
      parsedScripts = [scripts];
    }

    for (const script of parsedScripts) {
      let scriptArray;
      let x = 0;
      let y = 0;
      
      if (Array.isArray(script)) {
        scriptArray = script;
      } else if (script.blocks && Array.isArray(script.blocks)) {
        scriptArray = script.blocks;
        x = script.x || 0;
        y = script.y || 0;
      } else {
        continue;
      }

      processBlockSequence(scriptArray, null, true, x, y);
    }

    target.blocks.resetCache();
    
    // Request UI refresh
    try {
      if (window.vm && window.vm.emitWorkspaceUpdate) window.vm.emitWorkspaceUpdate();
      getRuntime().requestBlocksUpdate();
    } catch (_) {}
  }

  /* ───── Project Operations ───── */

  function deleteSprite(spriteName) {
    const target = getTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    getVM().deleteSprite(target.id);
  }

  function renameSprite(oldName, newName) {
    const target = getTarget(oldName);
    if (!target) throw new Error(`Sprite "${oldName}" not found`);
    getVM().renameSprite(target.id, newName);
  }

  function greenFlag() { getVM().greenFlag(); }
  function stopAll() { getVM().stopAll(); }

  function broadcastMessage(message) {
    getRuntime().startHats("event_whenbroadcastreceived", { BROADCAST_OPTION: message });
  }

  function setVariable(spriteName, varName, value) {
    const target = getTarget(spriteName) || getTarget("Stage");
    if (!target) throw new Error("Target not found");
    const varObj = Object.values(target.variables).find(v => v.name === varName);
    if (varObj) { varObj.value = value; }
    else {
      const id = ensureVariable(target, varName);
      target.variables[id].value = value;
    }
  }

  function deleteBlocks(spriteName) {
    const target = getTarget(spriteName);
    if (!target) return;
    const blockIds = Object.keys(target.blocks._blocks);
    blockIds.forEach(id => target.blocks.deleteBlock(id));
    getRuntime().requestBlocksUpdate();
  }

  function clearProject() {
    const rt = getRuntime();
    const spriteNames = rt.targets.filter(t => !t.isStage).map(t => t.sprite.name);
    spriteNames.forEach(name => { try { deleteSprite(name); } catch (_) { } });

    const stage = getTarget("Stage");
    if (stage) {
      Object.keys(stage.blocks._blocks).forEach(id => stage.blocks.deleteBlock(id));
    }
    rt.requestBlocksUpdate();
  }

  /* ───── Extension detection ───── */

  function detectRequiredExtensions(scripts) {
    const extensionIds = new Set();
    const prefixes = { pen: 1, music: 1, text2speech: 1, translate: 1, videoSensing: 1 };
    const walk = (blocks) => {
      for (const b of blocks) {
        if (b.opcode) {
          const p = b.opcode.split("_")[0];
          if (prefixes[p]) extensionIds.add(p);
        }
      }
    };
    for (const s of scripts) walk(s.blocks || []);
    return Array.from(extensionIds);
  }

  /* ───── Action Executor ───── */

  async function executeAction(action) {
    switch (action.type) {
      case "greenFlag": greenFlag(); break;
      case "stopAll": stopAll(); break;
      case "clearProject": clearProject(); break;
      case "broadcast": broadcastMessage(action.value); break;
      case "deleteSprite": deleteSprite(action.target); break;
      case "renameSprite": renameSprite(action.target, action.value); break;
      case "setVariable": setVariable(action.target, action.value, action.data || 0); break;
      case "addBackdrop": await addLibraryBackdrop(action.value || action.target); break;
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  /* ───── Apply Full AI Response ───── */

  async function applyAIResponse(response) {
    const errors = [];
    const log = [];

    // Pre-load library so it's ready
    await loadLibrary().catch(() => { });

    // Clear if requested
    if (response.actions && response.actions.some(a => a.type === "clearProject")) {
      clearProject();
      log.push("Cleared project.");
    }

    // ── Step 1: Create ALL sprites first (library or custom) ──
    if (response.sprites && response.sprites.length > 0) {
      const spritePromises = response.sprites.map(async (s) => {
        try {
          if (s.libraryName) {
            await addLibrarySprite(s.libraryName);
            // Rename if AI gave a different name
            if (s.name && s.name !== s.libraryName) {
              try { renameSprite(s.libraryName, s.name); } catch (_) { }
            }
            log.push(`Loaded library sprite: ${s.libraryName}`);
          } else {
            await createSprite(s);
            log.push(`Created sprite: ${s.name}`);
          }
        } catch (e) { errors.push(`Sprite "${s.name || s.libraryName}": ${e.message}`); }
      });
      await Promise.all(spritePromises);
    }

    // ── Step 2: Add costumes (library or custom) ──
    if (response.costumes && response.costumes.length > 0) {
      const costumePromises = response.costumes.map(async (c) => {
        try {
          if (c.libraryName) {
            await addLibraryCostume(c.libraryName, c.spriteName);
            log.push(`Loaded library costume "${c.libraryName}" → ${c.spriteName}`);
          } else {
            await addCostumeToSprite(c.spriteName, c);
            log.push(`Added costume "${c.name}" → ${c.spriteName}`);
          }
        } catch (e) { errors.push(`Costume: ${e.message}`); }
      });
      await Promise.all(costumePromises);
    }

    // ── Step 3: Add sounds (library or custom) ──
    if (response.sounds && response.sounds.length > 0) {
      const soundPromises = response.sounds.map(async (s) => {
        try {
          if (s.libraryName) {
            await addLibrarySound(s.libraryName, s.spriteName);
            log.push(`Loaded library sound "${s.libraryName}" → ${s.spriteName}`);
          } else {
            await addSoundToSprite(s.spriteName, s);
            log.push(`Added sound "${s.name}" → ${s.spriteName}`);
          }
        } catch (e) { errors.push(`Sound: ${e.message}`); }
      });
      await Promise.all(soundPromises);
    }

    // ── Step 4: Add backdrops ──
    if (response.backdrops && response.backdrops.length > 0) {
      for (const b of response.backdrops) {
        try {
          if (b.libraryName) {
            await addLibraryBackdrop(b.libraryName);
            log.push(`Loaded library backdrop: ${b.libraryName}`);
          }
        } catch (e) { errors.push(`Backdrop: ${e.message}`); }
      }
    }

    // ── Step 5: Inject blocks for ALL sprites concurrently ──
    if (response.blocks && response.blocks.length > 0) {
      const blockPromises = response.blocks.map(async (blockSet) => {
        try {
          const spriteName = blockSet.spriteName;
          if (!getTarget(spriteName)) await createSprite({ name: spriteName });

          const exts = detectRequiredExtensions(blockSet.scripts || []);
          for (const ext of exts) await ensureExtension(ext);

          let parsedScripts = blockSet.scripts || [];
          if (Array.isArray(parsedScripts) && parsedScripts.length > 0 && !Array.isArray(parsedScripts[0]) && !parsedScripts[0].blocks) {
            parsedScripts = [parsedScripts];
          }

          injectBlocks(spriteName, parsedScripts);
          const scriptCount = parsedScripts.length;
          
          let blockCount = 0;
          function countBlocks(arr) {
            if (!Array.isArray(arr)) return;
            for (const item of arr) {
              if (item && typeof item === "object" && !Array.isArray(item)) {
                blockCount++;
                if (item.inputs) {
                   Object.values(item.inputs).forEach(val => countBlocks(val));
                }
              } else if (Array.isArray(item)) {
                countBlocks(item);
              }
            }
          }
          parsedScripts.forEach(s => countBlocks(s.blocks || s));

          log.push(`Injected ${scriptCount} script(s) (${blockCount} blocks) → ${spriteName}`);
        } catch (e) { errors.push(`Blocks "${blockSet.spriteName}": ${e.message}`); }
      });
      await Promise.all(blockPromises);
    }

    // ── Step 6: Execute actions ──
    if (response.actions && response.actions.length > 0) {
      for (const action of response.actions) {
        if (action.type === "clearProject") continue;
        try {
          await executeAction(action);
          log.push(`Action: ${action.type}`);
        } catch (e) { errors.push(`Action "${action.type}": ${e.message}`); }
      }
    }

    // ── Validation: check all sprites in response got blocks ──
    if (response.blocks && response.blocks.length > 0) {
      for (const blockSet of response.blocks) {
        const target = getTarget(blockSet.spriteName);
        if (target) {
          const count = Object.values(target.blocks._blocks).filter(b => b.topLevel).length;
          if (count === 0) {
            errors.push(`Warning: "${blockSet.spriteName}" has 0 top-level scripts after injection`);
          }
        }
      }
    }

    return { log, errors };
  }

  /* ───── Public API ───── */

  return {
    setVM, getVM, getRuntime, getTarget, getAllTargetNames,
    getProjectSummary, getLoadedExtensions, ensureExtension,
    createSprite, addCostumeToSprite, addSoundToSprite,
    injectBlocks, deleteSprite, renameSprite, greenFlag, stopAll,
    broadcastMessage, setVariable, deleteBlocks, clearProject,
    applyAIResponse,
    // Library
    loadLibrary, getLibraryNames,
    addLibrarySprite, addLibraryCostume, addLibrarySound, addLibraryBackdrop
  };
})();

window.__scratchCopilotVM = VMC;
