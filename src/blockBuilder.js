/**
 * blockBuilder.js
 * Engine that generates ANY Scratch block programmatically.
 * Handles opcode validation, input linking, shadow blocks,
 * stack stitching (next/parent), mutation, and substacks.
 */
(function () {
  "use strict";
  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("blockBuilder") || console;
  const hook = () => SC.vmHook;

  // ─── Normalise Script Input ─────────────────────────────────────────────
  function normaliseScript(script) {
    if (Array.isArray(script)) {
      if (script.length === 1 && script[0]?.next && typeof script[0].next === "object") {
        const out = []; let cur = script[0];
        while (cur && typeof cur === "object") { const { next } = cur; out.push(cur); cur = next; }
        return out;
      }
      return script;
    }
    if (script && typeof script === "object") {
      const out = []; let cur = script;
      while (cur && typeof cur === "object") { const { next } = cur; out.push(cur); cur = next; }
      return out;
    }
    return [];
  }

  // ─── Ensure Variable/List/Broadcast Exists ──────────────────────────────
  function createVariableOnTarget(target, id, name, type, value) {
    if (typeof target.createVariable === "function") {
      target.createVariable(id, name, type || "", false);
    } else {
      target.variables[id] = { id, name, value, type: type || "" };
    }
    const variable = target.variables[id] || target.lookupVariableById?.(id);
    if (variable) variable.value = value;
    return variable;
  }

  function ensureVariable(target, varName) {
    const existing = Object.values(target.variables).find(
      v => v.name === varName && (v.type === "" || v.type === "scalar" || !v.type)
    );
    if (existing) return existing.id || Object.keys(target.variables).find(k => target.variables[k] === existing);
    const stage = hook().getStageTarget();
    if (stage && stage !== target) {
      const sv = Object.values(stage.variables).find(
        v => v.name === varName && (v.type === "" || v.type === "scalar" || !v.type)
      );
      if (sv) return sv.id || Object.keys(stage.variables).find(k => stage.variables[k] === sv);
    }
    const id = hook().uid();
    createVariableOnTarget(target, id, varName, "", 0);
    return id;
  }

  function ensureList(target, listName) {
    const existing = Object.values(target.variables).find(v => v.name === listName && v.type === "list");
    if (existing) return existing.id || Object.keys(target.variables).find(k => target.variables[k] === existing);
    const stage = hook().getStageTarget();
    if (stage && stage !== target) {
      const sv = Object.values(stage.variables).find(v => v.name === listName && v.type === "list");
      if (sv) return sv.id || Object.keys(stage.variables).find(k => stage.variables[k] === sv);
    }
    const id = hook().uid();
    createVariableOnTarget(target, id, listName, "list", []);
    return id;
  }

  function ensureBroadcast(target, msgName) {
    const stage = hook().getStageTarget() || target;
    const existing = Object.values(stage.variables).find(v => v.name === msgName && v.type === "broadcast_msg");
    if (existing) return existing.id || Object.keys(stage.variables).find(k => stage.variables[k] === existing);
    const id = hook().uid();
    createVariableOnTarget(stage, id, msgName, "broadcast_msg", msgName);
    return id;
  }

  // ─── Opcode Classification ──────────────────────────────────────────────
  const HAT_OPCODES = new Set([
    "event_whenflagclicked", "event_whenkeypressed", "event_whenthisspriteclicked",
    "event_whenbackdropswitchesto", "event_whengreaterthan", "event_whenbroadcastreceived",
    "control_start_as_clone", "procedures_definition",
  ]);
  const INTERNAL_OPCODES = new Set([
    "text", "math_number", "math_positive_number", "math_whole_number", "math_integer",
    "math_angle", "colour_picker", "data_variable", "data_listcontents",
    "event_broadcast_menu", "control_create_clone_of_menu", "motion_goto_menu",
    "motion_glideto_menu", "motion_pointtowards_menu", "looks_costume", "looks_backdrops",
    "sound_sounds_menu", "sensing_touchingobjectmenu", "sensing_distancetomenu", "sensing_of_object_menu",
    "argument_reporter_string_number", "argument_reporter_boolean",
    "procedures_prototype", "procedures_call",
  ]);
  const OPCODE_PREFIXES = [
    "motion", "looks", "sound", "event", "control", "sensing", "operator", "data",
    "procedures", "pen", "music", "videoSensing", "text2speech", "translate",
    "makeymakey", "microbit", "ev3", "boost", "wedo2", "gdxfor",
  ];
  const EXTENSION_PREFIXES = new Set([
    "pen", "music", "videoSensing", "text2speech", "translate",
    "makeymakey", "microbit", "ev3", "boost", "wedo2", "gdxfor",
  ]);
  const KNOWN_EXTENSION_OPCODES = new Set([
    "pen_clear", "pen_stamp", "pen_penDown", "pen_penUp", "pen_setPenColorToColor",
    "pen_changePenSizeBy", "pen_setPenSizeTo",
    "music_playDrumForBeats", "music_restForBeats", "music_playNoteForBeats",
    "music_setInstrument", "music_setTempo", "music_changeTempo", "music_getTempo",
    "translate_getTranslate", "translate_getViewerLanguage", "translate_menu_languages",
    "text2speech_speakAndWait", "text2speech_setVoice", "text2speech_setLanguage",
  ]);
  const OPCODE_ALIASES = {
    pen_eraseAll: "pen_clear",
    pen_erase_all: "pen_clear",
    pen_setPenColorTo: "pen_setPenColorToColor",
    pen_set_color: "pen_setPenColorToColor",
    music_play_drum_for_beats: "music_playDrumForBeats",
    music_play_note_for_beats: "music_playNoteForBeats",
    text_to_speech_speak: "text2speech_speakAndWait",
    tts_speak: "text2speech_speakAndWait",
    video_sensing_video_on: "videoSensing_videoOn",
    translate: "translate_getTranslate",
    translate_text: "translate_getTranslate",
    translate_to: "translate_getTranslate",
    translate_menu_language: "translate_menu_languages",
    set_x: "motion_setx",
    set_y: "motion_sety",
    change_x: "motion_changexby",
    change_y: "motion_changeyby",
    motion_changex: "motion_changexby",
    motion_changey: "motion_changeyby",
    motion_setx: "motion_setx",
    motion_sety: "motion_sety",
    go_to: "motion_gotoxy",
    goto: "motion_gotoxy",
    sensing_ifonedge: "motion_ifonedgebounce",
    motion_ifonedge: "motion_ifonedgebounce",
    ifonedgebounce: "motion_ifonedgebounce",
    bounce_on_edge: "motion_ifonedgebounce",
  };
  const MAX_BLOCKS_PER_SCRIPT = 300;
  const MAX_BLOCKS_PER_TARGET = 2000;

  function normaliseOpcode(opcode) {
    if (typeof opcode !== "string") return opcode;
    const trimmed = opcode.trim();
    return OPCODE_ALIASES[trimmed] || trimmed;
  }

  function isScratchOpcode(str) {
    if (typeof str !== "string") return false;
    const opcode = normaliseOpcode(str);
    return OPCODE_PREFIXES.some(p => opcode.startsWith(p + "_"));
  }

  function extensionIdForOpcode(opcode) {
    const prefix = normaliseOpcode(opcode).split("_")[0];
    return EXTENSION_PREFIXES.has(prefix) ? prefix : null;
  }

  function inferExtensionsFromScripts(scripts) {
    const found = new Set();
    const visit = (value) => {
      if (value === null || value === undefined) return;
      if (typeof value === "string") {
        const ext = isScratchOpcode(value) ? extensionIdForOpcode(value) : null;
        if (ext) found.add(ext);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value === "object") {
        if (value.opcode) {
          const ext = extensionIdForOpcode(value.opcode);
          if (ext) found.add(ext);
        }
        visit(value.inputs);
        visit(value.fields);
        visit(value.next);
      }
    };
    visit(scripts);
    return [...found];
  }

  function isKnownOpcode(vm, opcode) {
    opcode = normaliseOpcode(opcode);
    return (
      HAT_OPCODES.has(opcode) ||
      INTERNAL_OPCODES.has(opcode) ||
      KNOWN_EXTENSION_OPCODES.has(opcode) ||
      opcode.endsWith("_menu") ||
      opcode.includes("_menu_") ||
      Boolean(vm.runtime?._primitives?.[opcode])
    );
  }

  function validateBlockMap(blockMap, vm) {
    const ids = Object.keys(blockMap);
    const errors = [];
    if (ids.length === 0) errors.push("script produced no blocks");
    if (ids.length > MAX_BLOCKS_PER_SCRIPT) {
      errors.push(`script has ${ids.length} blocks; limit is ${MAX_BLOCKS_PER_SCRIPT}`);
    }
    const topLevel = ids.filter(id => blockMap[id]?.topLevel);
    if (topLevel.length !== 1) errors.push(`script must have exactly 1 top-level block, found ${topLevel.length}`);
    for (const id of ids) {
      const block = blockMap[id];
      if (!block || typeof block !== "object") {
        errors.push(`Block ${id} is malformed`);
        continue;
      }
      if (!block.opcode || typeof block.opcode !== "string") {
        errors.push(`Block ${id} missing opcode`);
      } else if (!isKnownOpcode(vm, block.opcode)) {
        errors.push(`Unknown opcode "${block.opcode}"`);
      }
      if (block.next && !blockMap[block.next]) errors.push(`Block ${id} references missing next ${block.next}`);
      if (block.parent && !blockMap[block.parent]) errors.push(`Block ${id} references missing parent ${block.parent}`);
      for (const [inputName, input] of Object.entries(block.inputs || {})) {
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          errors.push(`Block ${id} input ${inputName} is malformed`);
          continue;
        }
        if (input.block && !blockMap[input.block]) errors.push(`Block ${id} input ${inputName} references missing block ${input.block}`);
        if (input.shadow && !blockMap[input.shadow]) errors.push(`Block ${id} input ${inputName} references missing shadow ${input.shadow}`);
      }
    }
    if (errors.length) throw new Error(errors.slice(0, 5).join("; "));
  }

  function commitBlockMap(target, blockMap) {
    const blocks = target.blocks;
    const previousBlocks = { ...(blocks._blocks || {}) };
    const previousScripts = Array.isArray(blocks._scripts) ? [...blocks._scripts] : [];
    const topIds = Object.values(blockMap).filter(b => b?.topLevel).map(b => b.id);
    try {
      blocks._blocks = { ...previousBlocks, ...blockMap };
      if (!Array.isArray(blocks._scripts)) blocks._scripts = [];
      for (const id of topIds) {
        if (!blocks._scripts.includes(id)) blocks._scripts.push(id);
        if (blocks._blocks[id]) blocks._blocks[id].topLevel = true;
      }
      blocks.resetCache?.();
      blocks.updateTargetSpecificBlocks?.(target.isStage);
      if (typeof blocks.toXML === "function") {
        blocks.toXML(target.comments || {});
      }
    } catch (err) {
      blocks._blocks = previousBlocks;
      blocks._scripts = previousScripts;
      blocks.resetCache?.();
      throw err;
    }
  }

  // ─── Build Block Map ────────────────────────────────────────────────────
  function buildBlockMap(scriptArray, target) {
    scriptArray = normaliseScript(scriptArray);
    const blockMap = {};
    const uid = () => hook().uid();

    function extractString(val) {
      if (val === null || val === undefined) return "";
      if (Array.isArray(val)) return extractString(val[0]);
      if (typeof val === "object") {
        if (val.value !== undefined) return extractString(val.value);
        if (val.name !== undefined) return extractString(val.name);
        return "";
      }
      return String(val);
    }

    function createShadowText(parentId, textValue) {
      const sid = uid();
      blockMap[sid] = {
        id: sid,
        opcode: "text",
        next: null,
        parent: parentId,
        inputs: {},
        fields: { TEXT: { name: "TEXT", value: extractString(textValue), id: null } },
        shadow: true,
        topLevel: false,
      };
      return sid;
    }

    function createShadowNumber(parentId, numberValue, opcode = "math_number") {
      const sid = uid();
      const numStr = extractString(numberValue);
      const num = Number(numStr);
      blockMap[sid] = {
        id: sid,
        opcode,
        next: null,
        parent: parentId,
        inputs: {},
        fields: { NUM: { name: "NUM", value: String(Number.isFinite(num) ? num : 0), id: null } },
        shadow: true,
        topLevel: false,
      };
      return sid;
    }

    function createShadowColor(parentId, colorValue) {
      const sid = uid();
      const colorStr = extractString(colorValue);
      const value = /^#[0-9a-f]{6}$/i.test(colorStr) ? colorStr : "#000000";
      blockMap[sid] = {
        id: sid,
        opcode: "colour_picker",
        next: null,
        parent: parentId,
        inputs: {},
        fields: { COLOUR: { name: "COLOUR", value, id: null } },
        shadow: true,
        topLevel: false,
      };
      return sid;
    }

    function createVariableReporter(parentId, varName) {
      const name = extractString(varName) || "my variable";
      const vId = ensureVariable(target, name);
      const vid = uid();
      blockMap[vid] = {
        id: vid,
        opcode: "data_variable",
        next: null,
        parent: parentId,
        inputs: {},
        fields: { VARIABLE: { name: "VARIABLE", value: name, id: vId } },
        shadow: false,
        topLevel: false,
      };
      return vid;
    }

    function createListReporter(parentId, listName) {
      const name = extractString(listName) || "list";
      const lId = ensureList(target, name);
      const lid = uid();
      blockMap[lid] = {
        id: lid,
        opcode: "data_listcontents",
        next: null,
        parent: parentId,
        inputs: {},
        fields: { LIST: { name: "LIST", value: name, id: lId } },
        shadow: false,
        topLevel: false,
      };
      return lid;
    }

    function createBroadcastMenu(parentId, msgName) {
      const name = extractString(msgName) || "message1";
      const bId = ensureBroadcast(target, name);
      const bid = uid();
      blockMap[bid] = {
        id: bid,
        opcode: "event_broadcast_menu",
        next: null,
        parent: parentId,
        inputs: {},
        fields: { BROADCAST_OPTION: { name: "BROADCAST_OPTION", value: name, id: bId } },
        shadow: true,
        topLevel: false,
      };
      return bid;
    }

    function createMenuShadow(parentId, opcode, fieldName, value) {
      const sid = uid();
      blockMap[sid] = {
        id: sid,
        opcode: normaliseOpcode(opcode),
        next: null,
        parent: parentId,
        inputs: {},
        fields: { [fieldName]: { name: fieldName, value: extractString(value), id: null } },
        shadow: true,
        topLevel: false,
      };
      return sid;
    }

    function makeInput(name, blockId, shadowId = null) {
      return { name, block: blockId || null, shadow: shadowId || null };
    }

    function isBlockSpec(value) {
      return value && typeof value === "object" && !Array.isArray(value) && value.opcode;
    }

    function isTypedPrimitive(value) {
      if (!Array.isArray(value)) return false;
      const type = Number(value[0]);
      return Number.isInteger(type) && type >= 4 && type <= 13;
    }

    function isInputTuple(value) {
      return Array.isArray(value) && !isTypedPrimitive(value) && value.length >= 2 && Number.isInteger(Number(value[0]));
    }

    function prefersTextInput(key) {
      return ["MESSAGE", "TEXT", "PROMPT", "QUESTION", "STRING1", "STRING2"].includes(key);
    }

    function prefersNumberInput(key) {
      return (
        key.includes("NUM") ||
        ["VALUE", "DX", "DY", "DEGREES", "X", "Y", "SECS", "TIMES", "STEPS", "SIZE", "DURATION", "INDEX", "ITEM"].includes(key)
      );
    }

    function createDefaultShadow(parentId, key) {
      if (prefersTextInput(key)) return createShadowText(parentId, "");
      if (prefersNumberInput(key)) return createShadowNumber(parentId, 0);
      return null;
    }

    function createInputFromDefault(parentId, key, spec) {
      const [kind, a, b, c] = spec;
      if (kind === "text") return { block: createShadowText(parentId, a), shadow: true };
      if (kind === "number") return { block: createShadowNumber(parentId, a), shadow: true };
      if (kind === "integer") return { block: createShadowNumber(parentId, a, "math_integer"), shadow: true };
      if (kind === "angle") return { block: createShadowNumber(parentId, a, "math_angle"), shadow: true };
      if (kind === "color") return { block: createShadowColor(parentId, a), shadow: true };
      if (kind === "menu") return { block: createMenuShadow(parentId, a, b, c), shadow: true };
      return createInputBlock(parentId, a, key);
    }

    const DEFAULT_INPUTS = {
      operator_join: { STRING1: ["text", ""], STRING2: ["text", ""] },
      operator_add: { NUM1: ["number", 0], NUM2: ["number", 0] },
      operator_subtract: { NUM1: ["number", 0], NUM2: ["number", 0] },
      operator_multiply: { NUM1: ["number", 1], NUM2: ["number", 1] },
      operator_divide: { NUM1: ["number", 1], NUM2: ["number", 1] },
      translate_getTranslate: {
        WORDS: ["text", "Hello"],
        LANGUAGE: ["menu", "translate_menu_languages", "LANGUAGE", "hi"],
      },
      text2speech_speakAndWait: { WORDS: ["text", "Hello"] },
      music_playDrumForBeats: {
        DRUM: ["menu", "music_menu_DRUM", "DRUM", "1"],
        BEATS: ["number", 0.25],
      },
      music_playNoteForBeats: { NOTE: ["number", 60], BEATS: ["number", 0.5] },
      music_setInstrument: { INSTRUMENT: ["menu", "music_menu_INSTRUMENT", "INSTRUMENT", "1"] },
      music_setTempo: { TEMPO: ["number", 80] },
      motion_goto: { TO: ["menu", "motion_goto_menu", "TO", "_mouse_"] },
      motion_glideto: { SECS: ["number", 1], TO: ["menu", "motion_goto_menu", "TO", "_mouse_"] },
      control_repeat: { TIMES: ["number", 10] },
      control_for_each: { VALUE: ["text", "10"] },
      control_if: { CONDITION: ["boolean", null] },
      control_if_else: { CONDITION: ["boolean", null] },
      control_repeat_until: { CONDITION: ["boolean", null] },
      control_wait_until: { CONDITION: ["boolean", null] },
      sensing_touchingobject: { TOUCHINGOBJECTMENU: ["menu", "sensing_touchingobjectmenu", "TOUCHINGOBJECTMENU", "_edge_"] },
      sensing_distanceto: { DISTANCETOMENU: ["menu", "sensing_distancetomenu", "DISTANCETOMENU", "_mouse_"] },
      sensing_of: { OBJECT: ["menu", "sensing_of_object_menu", "OBJECT", "_stage_"] },
      motion_pointtowards: { TOWARDS: ["menu", "motion_pointtowards_menu", "TOWARDS", "_mouse_"] },
      sound_playuntildone: { SOUND_MENU: ["menu", "sound_sounds_menu", "SOUND_MENU", "Meow"] },
      sound_play: { SOUND_MENU: ["menu", "sound_sounds_menu", "SOUND_MENU", "Meow"] },
      looks_switchcostumeto: { COSTUME: ["menu", "looks_costume", "COSTUME", "costume1"] },
      looks_switchbackdropto: { BACKDROP: ["menu", "looks_backdrops", "BACKDROP", "backdrop1"] },
    };

    const DEFAULT_FIELDS = {
      text2speech_setVoice: { VOICE: "alto" },
      text2speech_setLanguage: { LANGUAGE: "hi" },
      control_for_each: { VARIABLE: "i" },
    };

    function createInputBlock(parentId, value, key) {
      if (isTypedPrimitive(value)) {
        const type = Number(value[0]);
        const raw = value[1];
        if ((type === 10 || type === 12 || type === 13) && typeof raw === "string" && isScratchOpcode(raw)) {
          return { block: processBlock({ opcode: normaliseOpcode(raw) }, parentId, false), shadow: false };
        }
        switch (type) {
          case 4: return { block: createShadowNumber(parentId, raw, "math_number"), shadow: true };
          case 5: return { block: createShadowNumber(parentId, raw, "math_positive_number"), shadow: true };
          case 6: return { block: createShadowNumber(parentId, raw, "math_whole_number"), shadow: true };
          case 7: return { block: createShadowNumber(parentId, raw, "math_integer"), shadow: true };
          case 8: return { block: createShadowNumber(parentId, raw, "math_angle"), shadow: true };
          case 9: return { block: createShadowColor(parentId, raw), shadow: true };
          case 10: return { block: createShadowText(parentId, raw), shadow: true };
          case 11: return { block: createBroadcastMenu(parentId, raw), shadow: true };
          case 12: return { block: createVariableReporter(parentId, raw), shadow: false };
          case 13: return { block: createListReporter(parentId, raw), shadow: false };
        }
      }

      const maybeNumber =
        typeof value === "number" ||
        (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
      const blockId =
        !prefersTextInput(key) && maybeNumber
          ? createShadowNumber(parentId, value)
          : createShadowText(parentId, value);
      return { block: blockId, shadow: true };
    }

    function createShadowInput(parentId, value, key) {
      const created = createInputBlock(parentId, value, key);
      return created.shadow ? created.block : null;
    }

    function connectNestedInput(parentBlock, key, nested, mode = 2, shadowSpec) {
      nested = { ...nested, opcode: normaliseOpcode(nested.opcode) };
      const subId = processBlock(nested, parentBlock.id, false);
      if (!subId) return;
      const inputMode = Number(mode);
      let shadowId = nested.shadow ? subId : null;
      if (!shadowId && inputMode === 3 && typeof shadowSpec !== "undefined") {
        shadowId = createShadowInput(parentBlock.id, shadowSpec, key);
      }
      if (!shadowId && inputMode !== 2) {
        shadowId = createDefaultShadow(parentBlock.id, key);
      }
      parentBlock.inputs[key] = makeInput(key, subId, shadowId);
    }

    function connectAnyInput(block, key, value) {
      let val = value;
      if (typeof val === "string" && isScratchOpcode(val)) {
        val = { opcode: normaliseOpcode(val) };
      } else if (isInputTuple(val) && typeof val[1] === "string" && isScratchOpcode(val[1])) {
        val = [val[0], { opcode: normaliseOpcode(val[1]) }, val[2]];
      }

      if (isBlockSpec(val)) {
        connectNestedInput(block, key, val, 2);
        return;
      }

      if (isInputTuple(val)) {
        const [mode, inner, shadowSpec] = val;
        if (isBlockSpec(inner)) {
          connectNestedInput(block, key, inner, mode ?? 2, shadowSpec);
          return;
        }
        if (isTypedPrimitive(inner) && typeof inner[1] === "string" && isScratchOpcode(inner[1])) {
          connectNestedInput(block, key, { opcode: normaliseOpcode(inner[1]) }, mode ?? 2, shadowSpec);
          return;
        }
        if (Array.isArray(inner) && inner[0] === 12 && target) {
          const vid = createVariableReporter(block.id, inner[1]);
          const shadowId = Number(mode) === 3 ? createShadowInput(block.id, shadowSpec, key) : null;
          block.inputs[key] = makeInput(key, vid, shadowId);
          return;
        }
        if (Array.isArray(inner) && inner[0] === 13 && target) {
          const lid = createListReporter(block.id, inner[1]);
          const shadowId = Number(mode) === 3 ? createShadowInput(block.id, shadowSpec, key) : null;
          block.inputs[key] = makeInput(key, lid, shadowId);
          return;
        }
        const created = createInputBlock(block.id, inner, key);
        block.inputs[key] = makeInput(key, created.block, created.shadow ? created.block : null);
        return;
      }

      const created = createInputBlock(block.id, val, key);
      block.inputs[key] = makeInput(key, created.block, created.shadow ? created.block : null);
    }

    function parseSubstack(value) {
      if (!value) return [];
      // Handle Scratch-style tuples [mode, content] or [mode, content, shadow]
      if (Array.isArray(value) && value.length >= 2 && (typeof value[0] === "number" || !isNaN(value[0]))) {
        return parseSubstack(value[1]);
      }
      // Handle object wrappers like { blocks: [...] } or { script: [...] }
      if (typeof value === "object" && !Array.isArray(value)) {
        if (value.opcode) return [value];
        if (Array.isArray(value.blocks)) return parseSubstack(value.blocks);
        if (Array.isArray(value.script)) return parseSubstack(value.script);
        if (value.next) return [value, ...parseSubstack(value.next)];
      }
      // Handle arrays
      if (Array.isArray(value)) {
        // If it's a flat array of blocks, return it
        if (value.length > 0 && typeof value[0] === "object" && value[0].opcode) return value;
        // If it's a nested array [[...]], flatten one level and recurse
        if (value.length > 0 && Array.isArray(value[0])) return parseSubstack(value[0]);
        // Last resort: filter for objects with opcodes
        return value.filter(v => v && typeof v === "object" && v.opcode);
      }
      return [];
    }

    function processBlock(def, parentId, isTop) {
      if (!def || typeof def !== "object" || !def.opcode) return null;
      const opcode = normaliseOpcode(def.opcode);
      const id = uid();
      const block = {
        id, opcode, next: null, parent: parentId,
        inputs: {}, fields: {}, shadow: !!def.shadow, topLevel: isTop,
      };
      if (def.mutation) block.mutation = def.mutation;
      if (isTop) { block.x = 50; block.y = 50; }

      // Fill in defaults for missing inputs/fields (critical for extensions)
      const defInps = DEFAULT_INPUTS[opcode];
      if (defInps) {
        for (const [k, spec] of Object.entries(defInps)) {
          if (!def.inputs || !(k in def.inputs)) {
            const created = createInputFromDefault(id, k, spec);
            block.inputs[k] = makeInput(k, created.block, created.shadow ? created.block : null);
          }
        }
      }
      const defFlds = DEFAULT_FIELDS[opcode];
      if (defFlds) {
        for (const [k, val] of Object.entries(defFlds)) {
          if (!def.fields || !(k in def.fields)) {
            block.fields[k] = { name: k, value: val, id: null };
          }
        }
      }

      // Fields
      if (def.fields) {
        for (const [key, value] of Object.entries(def.fields)) {
          const extractedVal = extractString(value);
          const extractedId = Array.isArray(value) ? value[1] : (value && typeof value === "object" ? value.id : null);

          if (key === "VARIABLE" && target) {
            const vName = extractedVal || "my variable";
            const vId = ensureVariable(target, vName);
            block.fields[key] = { name: key, value: vName, id: vId };
          } else if (key === "LIST" && target) {
            const lName = extractedVal || "list";
            const lId = ensureList(target, lName);
            block.fields[key] = { name: key, value: lName, id: lId };
          } else if (key === "BROADCAST_OPTION" && target) {
            const bName = extractedVal || "message1";
            const bId = ensureBroadcast(target, bName);
            block.fields[key] = { name: key, value: bName, id: bId };
          } else {
            block.fields[key] = { name: key, value: extractedVal, id: extractedId || null };
          }
        }
      }

      // Inputs
      if (def.inputs) {
        for (const [key, value] of Object.entries(def.inputs)) {
          if (key === "SUBSTACK" || key === "SUBSTACK2") {
            const subBlocks = parseSubstack(value);
            if (subBlocks.length > 0) {
              const subRootId = buildChain(subBlocks, id);
              block.inputs[key] = makeInput(key, subRootId, null);
            }
          } else if (key === "CONDITION" || key === "OPERAND" || key === "OPERAND1" || key === "OPERAND2") {
            // Boolean reporter inputs
            if (isBlockSpec(value)) {
              connectNestedInput(block, key, value, 2);
            } else if (Array.isArray(value)) {
              const [mode, inner, shadowSpec] = value;
              if (isBlockSpec(inner)) {
                connectNestedInput(block, key, inner, mode ?? 2, shadowSpec);
              } else if (isTypedPrimitive(inner) && typeof inner[1] === "string" && isScratchOpcode(inner[1])) {
                connectNestedInput(block, key, { opcode: normaliseOpcode(inner[1]) }, mode ?? 2, shadowSpec);
              } else if (isTypedPrimitive(inner)) {
                const created = createInputBlock(id, inner, key);
                block.inputs[key] = makeInput(key, created.block, created.shadow ? created.block : null);
              } else {
                const created = createInputBlock(id, inner, key);
                block.inputs[key] = makeInput(key, created.block, created.shadow ? created.block : null);
              }
            }
          } else if (key === "BROADCAST_INPUT" && target) {
            let bName;
            if (Array.isArray(value)) {
              const inner = value[1];
              if (Array.isArray(inner) && inner[0] === 11) {
                bName = extractString(inner[1]);
              } else {
                bName = extractString(inner);
              }
            } else {
              bName = extractString(value);
            }
            if (bName) {
              const bid = createBroadcastMenu(id, bName);
              block.inputs[key] = makeInput(key, bid, bid);
            } else {
              const created = createInputBlock(id, value, key);
              block.inputs[key] = makeInput(key, created.block, created.shadow ? created.block : null);
            }
          } else {
            let val = value;
              
              // Restore normalization
              if (isScratchOpcode(val)) {
                val = { opcode: val };
              } else if (Array.isArray(val) && val.length >= 2 && isScratchOpcode(val[1])) {
                val[1] = { opcode: val[1] };
              }

              // Handle Nested block object
              if (isBlockSpec(val)) {
                connectNestedInput(block, key, val, 1);
                continue;
              }

              let innerVal = val;
              if (Array.isArray(val)) {
                innerVal = val[1];
                // Handle nested [type, value] primitives
                if (Array.isArray(innerVal) && isTypedPrimitive(innerVal)) {
                  innerVal = innerVal[1];
                }
              }

              // Check if this input key has a "menu" default for this opcode
              const spec = DEFAULT_INPUTS[opcode]?.[key];
              if (spec && spec[0] === "menu" && (typeof innerVal === "string" || typeof innerVal === "number") && !isScratchOpcode(innerVal)) {
                const sid = createMenuShadow(id, spec[1], spec[2], innerVal);
                block.inputs[key] = makeInput(key, sid, sid);
              } else {
                // If it's an array and not a menu, use the existing array logic
                if (Array.isArray(val)) {
                  const [m, inner, shadowIdParam] = val;
                  if (isBlockSpec(inner)) {
                    connectNestedInput(block, key, inner, m ?? 2, shadowIdParam);
                    continue;
                  }
                  if (isTypedPrimitive(inner) && typeof inner[1] === "string" && isScratchOpcode(inner[1])) {
                    connectNestedInput(block, key, { opcode: normaliseOpcode(inner[1]) }, m ?? 2, shadowIdParam);
                    continue;
                  }
                  if (Array.isArray(inner) && inner[0] === 12 && target) {
                    const vid = createVariableReporter(id, inner[1]);
                    const shadowId = m === 3 ? createShadowInput(id, shadowIdParam, key) : null;
                    block.inputs[key] = makeInput(key, vid, shadowId);
                    continue;
                  }
                  if (Array.isArray(inner) && inner[0] === 13 && target) {
                    const lid = createListReporter(id, inner[1]);
                    const shadowId = m === 3 ? createShadowInput(id, shadowIdParam, key) : null;
                    block.inputs[key] = makeInput(key, lid, shadowId);
                    continue;
                  }
                  if (isTypedPrimitive(inner)) {
                    const created = createInputBlock(id, inner, key);
                    block.inputs[key] = makeInput(key, created.block, created.shadow ? created.block : null);
                    continue;
                  }
                  const created = createInputBlock(id, inner, key);
                  block.inputs[key] = makeInput(key, created.block, created.shadow ? created.block : null);
                } else {
                  // Bare value
                  const created = createInputBlock(id, val, key);
                  block.inputs[key] = makeInput(key, created.block, created.shadow ? created.block : null);
                }
              }
            }
        }
      }
      blockMap[id] = block;
      return id;
    }

    function buildChain(blocks, parentId, topLevel) {
      if (!Array.isArray(blocks)) return null;
      let prevId = null, rootId = null;
      for (let i = 0; i < blocks.length; i++) {
        const id = processBlock(blocks[i], prevId, topLevel && !rootId);
        if (!id) continue;
        if (!rootId) { rootId = id; if (parentId && !topLevel) blockMap[id].parent = parentId; }
        if (prevId !== null) blockMap[prevId].next = id;
        prevId = id;
      }
      return rootId;
    }

    buildChain(scriptArray, null, true);
    return { blockMap };
  }

  // ─── Inject Blocks ──────────────────────────────────────────────────────
  async function injectBlocks(spriteName, scripts) {
    const h = hook(); const vm = h.requireVM();
    
    // Wait for target to appear (up to 5 seconds)
    let target = h.resolveTarget(spriteName);
    if (!target) {
      log.info(`Waiting for sprite "${spriteName}" to appear in VM...`);
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 250));
        target = h.resolveTarget(spriteName);
        if (target) break;
      }
    }

    if (!target) throw new Error(`Sprite "${spriteName}" not found after creation.`);
    if (!target.blocks?._blocks) throw new Error(`Sprite "${spriteName}" has no block container`);
    for (const extId of inferExtensionsFromScripts(scripts)) {
      if (SC.extensionLoader && !SC.extensionLoader.isLoaded?.(extId)) {
        await SC.extensionLoader.loadExtension(extId);
      }
    }
    try { vm.stopAll?.(); } catch (_) { /* ignore */ }

    // Make sure the blocks workspace is pointing at the same target.
    // Without this, blocks can be created in the project data but appear
    // "missing" in the GUI until the user manually selects the sprite.
    try { vm.setEditingTarget?.(target.id); } catch (_) { /* ignore */ }

    let targetBlockCount = Object.keys(target.blocks._blocks || {}).length;
    const safeScripts = Array.isArray(scripts) ? scripts : [];
    for (const scriptArray of safeScripts) {
      const { blockMap } = buildBlockMap(scriptArray, target);
      if (!blockMap) continue;
      validateBlockMap(blockMap, vm);
      if (targetBlockCount + Object.keys(blockMap).length > MAX_BLOCKS_PER_TARGET) {
        throw new Error(`Refusing to insert blocks: target would exceed ${MAX_BLOCKS_PER_TARGET} blocks`);
      }
      const beforeCount = Object.values(target.blocks._blocks || {}).filter(b => b?.topLevel).length;
      const topBlock = Object.values(blockMap).find(b => b.topLevel);
      if (topBlock) { topBlock.x = 40 + beforeCount * 350; topBlock.y = 40; }
      commitBlockMap(target, blockMap);
      targetBlockCount += Object.keys(blockMap).length;
      const afterCount = Object.values(target.blocks._blocks || {}).filter(b => b?.topLevel).length;
      if (afterCount <= beforeCount) {
        throw new Error("Blocks failed to inject: no new top-level script was committed");
      }
    }
    const health = validateBlockTree(spriteName);
    if (!health.valid) throw new Error(`Inserted blocks failed validation: ${health.errors.slice(0, 3).join("; ")}`);
    if (!h.safeEmitWorkspaceUpdate(vm)) {
      log.warn("Blocks were committed, but Scratch rejected the workspace refresh (non-fatal)");
    }
    try { vm.runtime?.emitProjectChanged?.(); } catch (_) { /* ignore */ }
    try { vm.setEditingTarget?.(target.id); } catch (_) { /* ignore */ }
    log.info(`Injected ${safeScripts.length} script(s) into "${spriteName}"`);
  }

  // ─── Clear Blocks ───────────────────────────────────────────────────────
  function clearBlocks(spriteName) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target?.blocks) return;
    try { vm.stopAll?.(); } catch (_) { /* ignore */ }
    target.blocks._blocks = {};
    if (Array.isArray(target.blocks._scripts)) target.blocks._scripts = [];
    target.blocks.resetCache?.();
    h.safeEmitWorkspaceUpdate(vm);
    log.info(`Cleared blocks for "${spriteName}"`);
  }

  // ─── Validate Block Tree ────────────────────────────────────────────────
  function validateBlockTree(spriteName) {
    const h = hook();
    const target = h.resolveTarget(spriteName);
    if (!target) return { valid: true, errors: [] };
    const blocks = target.blocks._blocks || {};
    const errors = [];
    for (const [id, b] of Object.entries(blocks)) {
      if (!b.opcode) errors.push(`Block ${id} missing opcode`);
      if (b.next && !blocks[b.next]) errors.push(`Block ${id} references missing next: ${b.next}`);
      if (b.parent && !blocks[b.parent]) errors.push(`Block ${id} references missing parent: ${b.parent}`);
      for (const [inputName, input] of Object.entries(b.inputs || {})) {
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          errors.push(`Block ${id} input ${inputName} is malformed`);
          continue;
        }
        if (input.block && !blocks[input.block]) {
          errors.push(`Block ${id} input ${inputName} references missing block: ${input.block}`);
        }
        if (input.shadow && !blocks[input.shadow]) {
          errors.push(`Block ${id} input ${inputName} references missing shadow: ${input.shadow}`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  // ─── Auto-Repair ────────────────────────────────────────────────────────
  function repairBlockTree(spriteName) {
    const h = hook();
    const target = h.resolveTarget(spriteName);
    if (!target) return 0;
    const blocks = target.blocks._blocks || {};
    let fixes = 0;
    for (const [id, b] of Object.entries(blocks)) {
      if (b.next && !blocks[b.next]) { b.next = null; fixes++; }
      if (b.parent && !blocks[b.parent]) { b.parent = null; b.topLevel = true; b.x = b.x || 50; b.y = b.y || 50; fixes++; }
    }
    if (fixes > 0) h.safeEmitWorkspaceUpdate(h.requireVM());
    log.info(`Repaired ${fixes} broken references in "${spriteName}"`);
    return fixes;
  }

  SC.blockBuilder = {
    buildBlockMap, injectBlocks, clearBlocks, normaliseScript,
    validateBlockTree, repairBlockTree,
    ensureVariable, ensureList, ensureBroadcast,
    inferExtensionsFromScripts, normaliseOpcode,
  };
  log.info("blockBuilder loaded");
})();
