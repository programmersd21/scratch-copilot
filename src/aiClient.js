/**
 * aiClient.js
 * Google Gemini AI integration for Scratch Copilot.
 * Translates natural language prompts into structured Scratch JSON.
 */
(function () {
  "use strict";
  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("aiClient") || console;

  const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
  const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 90000;
  const API_KEY_STORAGE = "scratchCopilot_geminiApiKey";

  function getApiKey() { return localStorage.getItem(API_KEY_STORAGE) || ""; }
  function setApiKey(key) { localStorage.setItem(API_KEY_STORAGE, key.trim()); }
  function hasApiKey() { return Boolean(getApiKey()); }

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

  async function callGemini(prompt, libraryNames, projectSummary, opcodeLibrary) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("No API key configured");
    const systemPrompt = buildSystemPrompt(libraryNames, projectSummary, opcodeLibrary);
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
    const url = `${GEMINI_ENDPOINT}?key=${apiKey}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini API ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) throw new Error("Empty response from Gemini");
      return parseGeminiResponse(text);
    } catch (err) {
      clearTimeout(tid);
      if (err.name === "AbortError") throw new Error("Request timed out (90s)");
      throw err;
    }
  }

  function parseGeminiResponse(text) {
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

  async function sendPrompt(userMessage, libraryNames, projectSummary, opcodeLibrary) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await callGemini(userMessage, libraryNames, projectSummary, opcodeLibrary);
      } catch (err) {
        lastError = err;
        log.warn(`AI attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
        if (err.message.includes("API key") || err.message.includes("401") || err.message.includes("403")) break;
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
    throw lastError;
  }

  SC.aiClient = { sendPrompt, getApiKey, setApiKey, hasApiKey, parseGeminiResponse };
  log.info("aiClient loaded");
})();
