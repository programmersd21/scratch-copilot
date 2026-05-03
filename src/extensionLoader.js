/**
 * extensionLoader.js
 * Dynamically loads Scratch extensions and tracks their state.
 * Handles permission issues and provides status checking.
 */
(function () {
  "use strict";
  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("extLoader") || console;
  const hook = () => SC.vmHook;

  const BUILTIN_EXTENSIONS = new Set([
    "pen", "music", "videoSensing", "text2speech", "translate", "faceSensing",
    "makeymakey", "microbit", "ev3", "boost", "wedo2", "gdxfor",
  ]);

  const EXTENSION_ALIASES = {
    video: "videoSensing",
    videosensing: "videoSensing",
    video_sensing: "videoSensing",
    videoSensing: "videoSensing",
    texttospeech: "text2speech",
    text_to_speech: "text2speech",
    text2speech: "text2speech",
    tts: "text2speech",
    gdx_for: "gdxfor",
    gdxforce: "gdxfor",
    gdxfor: "gdxfor",
    facesensing: "faceSensing",
    face_sensing: "faceSensing",
    faceSensing: "faceSensing",
  };

  function normaliseExtensionId(extensionId) {
    const raw = String(extensionId || "").trim();
    if (!raw) return "";
    const key = raw.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return EXTENSION_ALIASES[key] || EXTENSION_ALIASES[key.toLowerCase()] || raw;
  }

  function isURL(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }

  async function loadExtension(extensionId) {
    extensionId = normaliseExtensionId(extensionId);
    if (!extensionId) throw new Error("Extension id is required");
    const h = hook(); const vm = h.requireVM();
    const manager = vm.extensionManager || vm.runtime?.extensionManager;
    if (!manager) throw new Error("Extension manager not available");

    if (manager.isExtensionLoaded?.(extensionId)) {
      log.info(`Extension "${extensionId}" already loaded`);
      return true;
    }

    if (!BUILTIN_EXTENSIONS.has(extensionId)) {
      log.warn(`Extension "${extensionId}" is not a known built-in; attempting load anyway`);
    }

    const withTimeout = async (promise, label, ms = 15000) => {
      let t;
      const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      });
      try {
        return await Promise.race([promise, timeout]);
      } finally {
        clearTimeout(t);
      }
    };

    try {
      let attempted;
      let calledLoader = false;
      if (BUILTIN_EXTENSIONS.has(extensionId)) {
        if (typeof manager.loadExtensionIdSync === "function") {
          calledLoader = true;
          attempted = manager.loadExtensionIdSync(extensionId);
        } else if (typeof manager.loadExtensionId === "function") {
          calledLoader = true;
          attempted = manager.loadExtensionId(extensionId);
        }
      } else if (isURL(extensionId) && typeof manager.loadExtensionURL === "function") {
        calledLoader = true;
        attempted = manager.loadExtensionURL(extensionId);
      } else if (typeof manager.loadExtensionId === "function") {
        calledLoader = true;
        attempted = manager.loadExtensionId(extensionId);
      } else if (typeof manager.loadExtensionURL === "function") {
        calledLoader = true;
        attempted = manager.loadExtensionURL(extensionId);
      }

      if (!calledLoader && !manager.isExtensionLoaded?.(extensionId)) throw new Error("No extension load method available");
      await withTimeout(Promise.resolve(attempted), `Loading extension "${extensionId}"`);
    } catch (err) {
      throw new Error(`Failed to load extension "${extensionId}": ${err?.message || err}`);
    }

    // Verify load
    await new Promise(r => setTimeout(r, 200));
    if (!manager.isExtensionLoaded?.(extensionId)) {
      throw new Error(`Extension "${extensionId}" did not load successfully`);
    }

    h.safeEmitWorkspaceUpdate(vm);
    log.info(`Loaded extension "${extensionId}"`);
    return true;
  }

  function isLoaded(extensionId) {
    try {
      extensionId = normaliseExtensionId(extensionId);
      const vm = hook().requireVM();
      const manager = vm.extensionManager || vm.runtime?.extensionManager;
      return manager?.isExtensionLoaded?.(extensionId) ?? false;
    } catch { return false; }
  }

  function listLoaded() {
    try {
      const vm = hook().requireVM();
      const manager = vm.extensionManager || vm.runtime?.extensionManager;
      if (!manager) return [];
      if (typeof manager._loadedExtensions?.keys === "function") {
        return [...manager._loadedExtensions.keys()];
      }
      return [];
    } catch { return []; }
  }

  function listAvailable() {
    return [...BUILTIN_EXTENSIONS];
  }

  SC.extensionLoader = { loadExtension, isLoaded, listLoaded, listAvailable, normaliseExtensionId };
  log.info("extensionLoader loaded");
})();
