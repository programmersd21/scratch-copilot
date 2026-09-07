/**
 * aiClient.js
 * Multi-provider AI integration for Scratch Copilot.
 * Supports Gemini, OpenAI, OpenRouter, and Groq.
 * Translates natural language prompts into structured Scratch JSON.
 */
(function () {
  "use strict";
  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("aiClient") || console;

  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 90000;

  // ─── Storage keys ────────────────────────────────────────────────────────
  const STORAGE = {
    provider: "scratchCopilot_aiProvider",
    key: (p) => `scratchCopilot_${p}ApiKey`,
    model: (p) => `scratchCopilot_${p}Model`,
  };

  // ─── Provider definitions ────────────────────────────────────────────────
  const PROVIDERS = {
    gemini: {
      id: "gemini",
      label: "Google Gemini",
      defaultModel: "gemini-2.0-flash",
      endpoint: (model) =>
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      keyPlaceholder: "AIza...",
      helpUrl: "https://aistudio.google.com/app/apikey",
      helpLabel: "aistudio.google.com",
      authType: "query", // API key passed as ?key= query param
      format: "gemini", // Gemini-native request/response format
    },
    openai: {
      id: "openai",
      label: "OpenAI",
      defaultModel: "gpt-4o",
      endpoint: () => "https://api.openai.com/v1/chat/completions",
      keyPlaceholder: "sk-...",
      helpUrl: "https://platform.openai.com/api-keys",
      helpLabel: "platform.openai.com",
      authType: "bearer",
      format: "openai", // OpenAI chat completions format
    },
    openrouter: {
      id: "openrouter",
      label: "OpenRouter",
      defaultModel: "openrouter/free",
      endpoint: () => "https://openrouter.ai/api/v1/chat/completions",
      keyPlaceholder: "sk-or-...",
      helpUrl: "https://openrouter.ai/keys",
      helpLabel: "openrouter.ai",
      authType: "bearer",
      format: "openai",
    },
    groq: {
      id: "groq",
      label: "Groq",
      defaultModel: "openai/gpt-oss-120b",
      endpoint: () => "https://api.groq.com/openai/v1/chat/completions",
      keyPlaceholder: "gsk_...",
      helpUrl: "https://console.groq.com/keys",
      helpLabel: "console.groq.com",
      authType: "bearer",
      format: "openai",
    },
  };

  const DEFAULT_PROVIDER = localStorage.getItem(STORAGE.key("gemini")) ? "gemini" : "groq";

  // ─── Settings helpers ────────────────────────────────────────────────────
  function getProvider() {
    const p = localStorage.getItem(STORAGE.provider) || "";
    return PROVIDERS[p] ? p : DEFAULT_PROVIDER;
  }

  function setProvider(id) {
    if (!PROVIDERS[id]) throw new Error(`Unknown provider: ${id}`);
    localStorage.setItem(STORAGE.provider, id);
  }

  function getProviderConfig() {
    return PROVIDERS[getProvider()];
  }

  function getApiKey(providerId) {
    const p = providerId || getProvider();
    return localStorage.getItem(STORAGE.key(p)) || "";
  }

  function setApiKey(key, providerId) {
    const p = providerId || getProvider();
    localStorage.setItem(STORAGE.key(p), key.trim());
  }

  function hasApiKey(providerId) {
    return Boolean(getApiKey(providerId));
  }

  function getModel(providerId) {
    const p = providerId || getProvider();
    return localStorage.getItem(STORAGE.model(p)) || PROVIDERS[p].defaultModel;
  }

  function setModel(model, providerId) {
    const p = providerId || getProvider();
    localStorage.setItem(STORAGE.model(p), model.trim());
  }

  function getProviders() {
    return Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      label: p.label,
      defaultModel: p.defaultModel,
      keyPlaceholder: p.keyPlaceholder,
      helpUrl: p.helpUrl,
      helpLabel: p.helpLabel,
    }));
  }

  // ─── System prompt (shared across all providers) ─────────────────────────
  function buildSystemPrompt(libraryNames, projectSummary, opcodeLibrary) {
    const sprites = (libraryNames?.spriteNames || []).slice(0, 100).join(", ");
    const sounds = (libraryNames?.soundNames || []).slice(0, 80).join(", ");
    const backdrops = (libraryNames?.backdropNames || []).slice(0, 80).join(", ");
    const ctx = projectSummary ? `\n\nCURRENT PROJECT STATE:\n${JSON.stringify(projectSummary, null, 2)}` : "";

    let opcodeContext = "";
    if (opcodeLibrary) {
      opcodeContext = "\n\nAVAILABLE BLOCKS (OPCODES):\n";
      if (opcodeLibrary.core) {
        opcodeContext += "Core Blocks:\n";
        for (const [cat, ops] of Object.entries(opcodeLibrary.core)) {
          opcodeContext += `- ${cat}: ${ops.join(", ")}\n`;
        }
      }
      if (opcodeLibrary.extensions) {
        for (const [ext, blocks] of Object.entries(opcodeLibrary.extensions)) {
          opcodeContext += `Extension "${ext}" Blocks:\n`;
          blocks.forEach(b => {
            opcodeContext += `- ${b.opcode}: "${b.text}" (Args: ${b.arguments.join(", ")})\n`;
          });
        }
      }
    }

    return `You are Scratch Copilot — an elite Scratch 3.0 architect.
You transform natural language into complete Scratch projects.

RULES:
1. Respond with ONLY valid JSON. No markdown, no prose, no fences.
2. Pick BEST MATCH sprite names from the library list. Never leave libraryName null.
3. If user refers to an existing sprite, use its exact name from PROJECT STATE.
4. Always include event_whenflagclicked to initialize positions, variables, loops.
5. For games: implement full logic — score, win/loss, smooth movement.
6. When the user asks for music, speech, translate, pen, video sensing, face sensing, or any extension, the main behavior MUST use that extension's blocks. Do not fake extension behavior with ordinary sounds or unrelated movement.
7. NEVER use 'motion_goto' with 'mouse-pointer' unless the user explicitly mentions 'mouse', 'cursor', or 'follow'. Use exact coordinates (motion_gotoxy) for math and graphs.
8. LOGIC PRIORITY: Never use equality (=) for position checks. Sprites skip exact values.
   - For POSITIVE boundaries (right/top): use (Reporter > Number), e.g., (x position > 230).
   - For NEGATIVE boundaries (left/bottom): use (Reporter < Number), e.g., (x position < -230).
   - DANGER: Do not swap operands! (230 > x position) is WRONG. Always put the Reporter in OPERAND1.
9. If your plan creates new sprites and does not add any scripts to the default 'Sprite1', you MUST include a 'deleteSprite' action for 'Sprite1' in the 'actions' array to keep the project clean.
10. ASSET ORIENTATION: 'Rocketship' library assets face right (90 degrees). Default to direction 90 for rockets.
11. GRIFFPATCH MANIFESTO (EXPERT LEVEL):
    - NO KID STUFF: Do not use simple 'move 10 steps' or multiple event hats (e.g. 'when key pressed' or 'when face tilts').
    - SINGLE SCRIPT ARCHITECTURE: Consolidate ALL interaction logic into the main 'when flag clicked' -> 'forever' loop using 'if' and 'if/else' branches. Redundant hats are strictly forbidden.
    - ELIMINATE REDUNDANCY: Never create 'if/else' blocks where both branches perform the same action. Never use blocks that don't change state (e.g., switching to a costume the sprite is already wearing). Every block must have a meaningful purpose.
    - WASD PHYSICS: Use 'speed' variables. if key w: change speed by 1; if not key w: set speed to (speed * 0.9).
    - MODULARITY: Separate code into Custom Blocks (procedures). One for 'Handle Input', one for 'Physics', one for 'Render'.
    - 3D RAYCASTING:
      - Define a 'Raycast' custom block with 'warp':'true'.
      - Rendering: Clear pen, move to x: -240, repeat 480 times (for each column): calculate distance, draw vertical line.
    - NO HALLUCINATIONS: Do not use 'control_for_each'. Use 'control_repeat' with a variable (e.g., 'i') for loops.
JSON SCHEMA:
{
  "sprites": [{"name":"str","libraryName":"str","x":0,"y":0,"size":100,"direction":90}],
  "costumes": [{"spriteName":"str","libraryName":"str"}],
  "sounds": [{"spriteName":"str","libraryName":"str"}],
  "backdrops": [{"libraryName":"str"}],
  "blocks": [{"spriteName":"str","scripts":[[{block},{block}]]}],
  "variables": [{"spriteName":"Stage","name":"str","initialValue":0}],
  "lists": [{"spriteName":"Stage","name":"str","initialValues":[]}],
  "actions": [
    {"type":"greenFlag|stop|setPosition|setSize|setDirection|setVisibility|clearBlocks|deleteSprite|duplicateSprite|renameSprite","spriteName":"str","params":{}},
    {"type":"extension","params":{"extensionId":"pen|music|videoSensing|faceSensing|text2speech|translate"}}
  ],
  "message":"Summary of what was done"
}

BLOCK FORMAT:
Each block = { opcode, inputs, fields }
- inputs: { "KEY": [mode, [type, value]] } or { "KEY": value } or { "KEY": {opcode...} }
  CRITICAL: You MUST include ALL default input keys for a block, even if empty! (e.g. MESSAGE and SECS for sayforsecs, QUESTION for askandwait, STRING1 and STRING2 for operator_join, NUM1 and NUM2 for math).
  Reporter blocks MUST be nested block objects, never string/list placeholders. Correct: "MESSAGE": [2, {"opcode":"operator_join","inputs":{"STRING1":[1,[10,"Hello "]],"STRING2":[2,{"opcode":"sensing_answer"}]}}]
  mode: 1=shadow/literal, 2=block-no-shadow, 3=block+shadow
  type: 4=number, 5=positive_number, 6=positive_int, 7=integer, 8=angle, 9=color, 10=string, 11=broadcast, 12=variable
- fields: { "KEY": ["VALUE", null] }
- SUBSTACK/SUBSTACK2: arrays of blocks for control bodies. Never summarize loop bodies; include every nested block needed for the requested behavior.
- CONDITION: nested boolean reporter block object
- BROADCAST_INPUT: [1, [11, "messageName"]]
- Variables in inputs: [3, [12, "varName", ""], [10, "default"]]
- For event_whenbroadcastreceived: fields: { "BROADCAST_OPTION": ["msgName", null] }

EXTENSION BLOCKS: Load extension first via actions, then use real extension opcodes.
${opcodeContext}

LIBRARY ASSETS:
Sprites: ${sprites}
Sounds: ${sounds}
Backdrops: ${backdrops}
${ctx}

EXTENSION GUIDE - FACE SENSING:
- Use 'faceSensing_goToPart' with input 'PART' as a menu. INTERNAL VALUES MUST BE STRINGS: nose:"2", mouth:"3", left eye:"0", right eye:"1", between eyes:"6", left ear:"4", right ear:"5", top of head:"7".
- Use 'faceSensing_pointInFaceTiltDirection' to point in face tilt direction.
- Use 'faceSensing_setSizeToFaceSize' to set size to face size.
- Hat blocks: 'faceSensing_whenFaceDetected', 'faceSensing_whenTilted' (input DIRECTION: left|right), 'faceSensing_whenSpriteTouchesPart' (input PART: "2" for nose).
- Reporters: 'faceSensing_faceIsDetected' (boolean), 'faceSensing_faceTilt' (number), 'faceSensing_faceSize' (number).

TIPS:
- SMOOTH PHYSICS: use 'speed' variable. 'change speed by (1 * (sensing_keypressed(w) - sensing_keypressed(s)))'. 'set speed to (speed * 0.9)'. 'move (speed) steps'.
- PERFORMANCE: Always use Custom Blocks with 'warp':'true' for any rendering or raycasting.
- RAYCASTING ENGINE: 
  1. Loop 'i' from -45 to 45 (FOV).
  2. Inside loop: Set 'dist' to 0. Repeat until 'touching level': 'move 2 steps', 'change dist by 2'.
  3. Draw vertical line with Pen: length = (constant / dist).
- Use clearBlocks action before injecting if replacing a sprite's entire behavior.
- Always set proper x,y positions for sprites at the start of a script.
- If a block is a reporter (rounded), it MUST be nested inside an input of another block. Never place reporters as top-level blocks or inside SUBSTACK arrays directly.`;
  }

  // ─── Response parser (shared) ────────────────────────────────────────────
  function parseResponse(text) {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error(`Invalid JSON from AI: ${e.message}`);
    }
    return {
      sprites: Array.isArray(parsed.sprites) ? parsed.sprites : [],
      costumes: Array.isArray(parsed.costumes) ? parsed.costumes : [],
      sounds: Array.isArray(parsed.sounds) ? parsed.sounds : [],
      backdrops: Array.isArray(parsed.backdrops) ? parsed.backdrops : [],
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      variables: Array.isArray(parsed.variables) ? parsed.variables : [],
      lists: Array.isArray(parsed.lists) ? parsed.lists : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      message: typeof parsed.message === "string" ? parsed.message : "Done! Check your project.",
    };
  }

  // ─── Gemini-native call ──────────────────────────────────────────────────
  async function callGemini(prompt, systemPrompt, cfg) {
    const apiKey = getApiKey(cfg.id);
    if (!apiKey) throw new Error(`No API key configured for ${cfg.label}`);
    const model = getModel(cfg.id);
    const payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 8192, responseMimeType: "application/json" },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    };
    const url = `${cfg.endpoint(model)}?key=${apiKey}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${cfg.label} API ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) throw new Error(`Empty response from ${cfg.label}`);
      return parseResponse(text);
    } catch (err) {
      clearTimeout(tid);
      if (err.name === "AbortError") throw new Error("Request timed out (90s)");
      throw err;
    }
  }

  // ─── OpenAI-compatible call (OpenAI, OpenRouter, Groq) ───────────────────
  async function callOpenAICompatible(prompt, systemPrompt, cfg) {
    const apiKey = getApiKey(cfg.id);
    if (!apiKey) throw new Error(`No API key configured for ${cfg.label}`);
    const model = getModel(cfg.id);
    const payload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.15,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    };
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    // OpenRouter recommends these optional headers
    if (cfg.id === "openrouter") {
      headers["HTTP-Referer"] = "https://scratch.mit.edu";
      headers["X-Title"] = "Scratch Copilot";
    }
    const url = cfg.endpoint(model);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${cfg.label} API ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || "";
      if (!text) throw new Error(`Empty response from ${cfg.label}`);
      return parseResponse(text);
    } catch (err) {
      clearTimeout(tid);
      if (err.name === "AbortError") throw new Error("Request timed out (90s)");
      throw err;
    }
  }

  // ─── Unified call dispatcher ─────────────────────────────────────────────
  async function callAI(prompt, libraryNames, projectSummary, opcodeLibrary) {
    const cfg = getProviderConfig();
    const systemPrompt = buildSystemPrompt(libraryNames, projectSummary, opcodeLibrary);
    if (cfg.format === "gemini") {
      return callGemini(prompt, systemPrompt, cfg);
    }
    return callOpenAICompatible(prompt, systemPrompt, cfg);
  }

  // ─── Public sendPrompt with retry ────────────────────────────────────────
  async function sendPrompt(userMessage, libraryNames, projectSummary, opcodeLibrary) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await callAI(userMessage, libraryNames, projectSummary, opcodeLibrary);
      } catch (err) {
        lastError = err;
        log.warn(`AI attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
        if (err.message.includes("API key") || err.message.includes("401") || err.message.includes("403")) break;
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
    throw lastError;
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  SC.aiClient = {
    sendPrompt,
    getProvider,
    setProvider,
    getApiKey,
    setApiKey,
    hasApiKey,
    getModel,
    setModel,
    getProviders,
    parseResponse,
  };
  log.info("aiClient loaded");
})();