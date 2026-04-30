/**
 * aiClient.js — Gemini AI integration for Scratch Copilot.
 * Uses localStorage for API key (runs in MAIN world where chrome.storage is unavailable).
 */
const ScratchCopilotAI = (() => {
  "use strict";

  const MODEL = "gemini-3.1-flash-lite-preview";
  const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 90000;
  const STORAGE_KEY = "scratchCopilotApiKey";

  /* ───── API Key Storage (localStorage) ───── */

  function getApiKey() { return localStorage.getItem(STORAGE_KEY) || null; }
  function setApiKey(key) { localStorage.setItem(STORAGE_KEY, key); }
  function clearApiKey() { localStorage.removeItem(STORAGE_KEY); }

  /* ───── System Prompt ───── */

  const SYSTEM_INSTRUCTION = `You are an expert Scratch 3.0 block engineer. You output ONLY strict JSON — never explanations, prose, markdown fences, or anything else.

Your job: given a user's request plus the current project state and available library items, produce a JSON object that creates/modifies Scratch sprites, costumes, sounds, backdrops, and block scripts.

═══ OUTPUT SCHEMA ═══
{
  "sprites": [
    {
      "name": "Player",
      "libraryName": "Cat",
      "x": 0, "y": -120
    }
  ],
  "costumes": [
    { "spriteName": "Player", "libraryName": "cat-a" }
  ],
  "sounds": [
    { "spriteName": "Player", "libraryName": "Meow" }
  ],
  "backdrops": [
    { "libraryName": "Blue Sky" }
  ],
  "blocks": [
    {
      "spriteName": "Player",
      "scripts": [
        [
          { "opcode": "event_whenflagclicked", "inputs": {}, "fields": {} },
          { "opcode": "control_forever", "inputs": {
              "SUBSTACK": [
                { "opcode": "motion_movesteps", "inputs": { "STEPS": [1, [4, "5"]] }, "fields": {} },
                { "opcode": "motion_ifonedgebounce", "inputs": {}, "fields": {} }
              ]
            }, "fields": {} 
          }
        ]
      ]
    }
  ],
  "actions": [
    { "type": "greenFlag" }
  ]
}

═══ LIBRARY ITEMS ═══
• For sprites: set "libraryName" to a name from the available Scratch library (provided in context). The system loads the real Scratch sprite with all its costumes.
• For costumes: set "libraryName" to load from Scratch's costume library.
• For sounds: set "libraryName" to load from Scratch's sound library.
• For backdrops: set "libraryName" to load from Scratch's backdrop library.
• PREFER library items over custom SVGs whenever a suitable match exists.

═══ BLOCK FORMAT RULES ═══
• A "script" is an array of block objects that run in sequence.
• You do NOT need to provide "id", "next", "parent", or "topLevel". The system infers all of this from the array structure.
• Inputs use the sb3 array format:
  - Number:        [1, [4, "10"]]
  - Positive num:  [1, [5, "10"]]
  - String:        [1, [10, "hello"]]
  - Angle:         [1, [8, "90"]]
  - Color:         [1, [9, "#ff0000"]]
  - Variable:      [3, [12, "myVar"], [10, "0"]]
  - Broadcast:     [1, [11, "message1"]]
• Variable and broadcast IDs are auto-resolved — just provide the name.
• SUBSTACK (loop body / if body): The value MUST be an array of block objects, representing the sequence inside the loop.
• SUBSTACK2 (else body): MUST be an array of block objects.
• CONDITION (boolean input): Provide a single block object as the array element, e.g., "CONDITION": [2, { "opcode": "sensing_touchingobject", ... }]

═══ COMMON OPCODES ═══
Motion: motion_movesteps, motion_turnright, motion_turnleft, motion_gotoxy, motion_glidesecstoxy, motion_changexby, motion_setx, motion_changeyby, motion_sety, motion_ifonedgebounce, motion_pointindirection, motion_pointtowards
Looks: looks_sayforsecs, looks_say, looks_show, looks_hide, looks_switchcostumeto, looks_nextcostume, looks_changesizeby, looks_setsizeto, looks_seteffectto, looks_cleargraphiceffects, looks_gotofrontback
Sound: sound_play, sound_playuntildone, sound_changevolumeby, sound_setvolumeto
Events: event_whenflagclicked, event_whenkeypressed(fields:{KEY_OPTION:[key,null]}), event_whenthisspriteclicked, event_whenbroadcastreceived(fields:{BROADCAST_OPTION:[name,id]}), event_broadcast, event_broadcastandwait
Control: control_wait(DURATION), control_repeat(TIMES+SUBSTACK), control_forever(SUBSTACK), control_if(CONDITION+SUBSTACK), control_if_else(CONDITION+SUBSTACK+SUBSTACK2), control_wait_until(CONDITION), control_repeat_until(CONDITION+SUBSTACK), control_stop(fields:{STOP_OPTION:["all",null]}), control_create_clone_of, control_start_as_clone, control_delete_this_clone
Sensing: sensing_touchingobject, sensing_keypressed, sensing_mousedown, sensing_mousex, sensing_mousey, sensing_askandwait, sensing_answer, sensing_timer, sensing_resettimer
Operators: operator_add(NUM1,NUM2), operator_subtract, operator_multiply, operator_divide, operator_random(FROM,TO), operator_gt, operator_lt, operator_equals, operator_and, operator_or, operator_not, operator_join, operator_length, operator_mod, operator_round
Data: data_setvariableto(fields:{VARIABLE:[name,id]},inputs:{VALUE}), data_changevariableby(fields:{VARIABLE},inputs:{VALUE}), data_showvariable, data_hidevariable
Pen: pen_clear, pen_stamp, pen_penDown, pen_penUp, pen_setPenColorToColor, pen_setPenSizeTo
Music: music_playDrumForBeats, music_restForBeats, music_playNoteForBeats, music_setInstrument, music_setTempo, music_changeTempo
Video: videoSensing_videoToggle, videoSensing_setVideoTransparency, videoSensing_videoOn
TTS: text2speech_speakAndWait, text2speech_setVoice, text2speech_setLanguage
Translate: translate_getTranslate, translate_getViewerLanguage

═══ CRITICAL RULES ═══
1. EVERY sprite that needs behavior MUST have a corresponding entry in "blocks" with COMPLETE scripts. Do NOT skip any sprite.
2. Each sprite's scripts must be FULLY FUNCTIONAL — include all event handlers, loops, conditions, movement, collision, scoring, etc.
3. SVG costume data must include xmlns attribute.
4. When making a game, EVERY sprite needs its own complete block scripts — player movement, enemy AI, scoring, game-over logic, etc.
5. Always include a { "type": "greenFlag" } action to auto-run the project.
6. If the user says "clear" or "new project", include { "type": "clearProject" } action first.
7. Use nested arrays for scripts and substacks instead of relying on string IDs. Ensure proper sequence arrays for each script thread!
8. NEVER leave a sprite without blocks if it has any interactive behavior.`;

  /* ───── Streaming ───── */

  async function streamGemini(prompt, apiKey, onChunk, systemAddendum) {
    const url = `${API_BASE}/${MODEL}:streamGenerateContent?key=${apiKey}&alt=sse`;
    const sysText = systemAddendum
      ? SYSTEM_INSTRUCTION + "\n\n" + systemAddendum
      : SYSTEM_INSTRUCTION;
    const body = {
      system_instruction: { parts: [{ text: sysText }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
        maxOutputTokens: 65536
      }
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 400 && errText.includes("API_KEY_INVALID")) {
        throw new Error("INVALID_API_KEY");
      }
      throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE format: lines starting with "data: " followed by JSON
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const jsonStr = trimmed.slice(6);
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) onChunk(text);
        } catch (_) {
          // Non-SSE fallback: try parsing the whole line as JSON
          try {
            const parsed = JSON.parse(trimmed.replace(/^[,\[\]]/, ""));
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) onChunk(text);
          } catch (_2) { }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const data = buffer.trim().startsWith("data: ") ? buffer.trim().slice(6) : buffer.trim();
        const parsed = JSON.parse(data);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onChunk(text);
      } catch (_) { }
    }
  }

  /* ───── JSON Extraction ───── */

  function extractJSON(text) {
    // Strip markdown fences if present
    let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1) throw new Error("No JSON object found in AI response");
    return JSON.parse(cleaned.slice(first, last + 1));
  }

  function validateSchema(obj) {
    if (typeof obj !== "object" || obj === null) throw new Error("AI response is not an object");
    const allowed = new Set(["sprites", "costumes", "sounds", "blocks", "actions", "backdrops"]);
    for (const key of Object.keys(obj)) {
      if (!allowed.has(key)) continue;
      if (!Array.isArray(obj[key])) throw new Error(`"${key}" must be an array`);
    }
    const hasContent = ["sprites", "blocks", "actions", "costumes", "sounds", "backdrops"].some(
      k => Array.isArray(obj[k]) && obj[k].length > 0
    );
    if (!hasContent) throw new Error("AI response has no actionable content");
  }

  /* ───── Main Query Function ───── */

  async function queryAI(prompt, contextSummary, onProgress) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("NO_API_KEY");

    // Build the full prompt with context
    let fullPrompt = "";
    if (contextSummary) fullPrompt += `Current Scratch project state:\n${contextSummary}\n\n`;
    fullPrompt += `User request: ${prompt}`;

    // Build a system addendum with available library names
    let systemAddendum = "";
    try {
      const libNames = window.__scratchCopilotVM.getLibraryNames();
      if (libNames.sprites.length > 0) {
        systemAddendum += `\n═══ AVAILABLE SCRATCH LIBRARY ═══\n`;
        systemAddendum += `Sprites (use as libraryName): ${libNames.sprites.join(", ")}\n`;
        systemAddendum += `Costumes: ${libNames.costumes.join(", ")}\n`;
        systemAddendum += `Sounds: ${libNames.sounds.join(", ")}\n`;
        systemAddendum += `Backdrops: ${libNames.backdrops.join(", ")}\n`;
        systemAddendum += `Use these exact names as "libraryName" values to load real Scratch assets.\n`;
      }
    } catch (_) { }

    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        let accumulated = "";
        await streamGemini(fullPrompt, apiKey, (chunk) => {
          accumulated += chunk;
          if (onProgress) onProgress({ type: "chunk", data: chunk });
        }, systemAddendum);

        if (!accumulated.trim()) throw new Error("Empty response from AI");

        const result = extractJSON(accumulated);
        console.log("[ScratchCopilot] Raw AI JSON:", result);
        validateSchema(result);
        return result;
      } catch (err) {
        lastError = err;
        if (err.message === "NO_API_KEY" || err.message === "INVALID_API_KEY") throw err;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  return { queryAI, getApiKey, setApiKey, clearApiKey };
})();

window.__scratchCopilotAI = ScratchCopilotAI;
