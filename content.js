/**
 * content.js — Bootstrap for Scratch Copilot.
 * Runs in MAIN world so window.vm is directly accessible.
 * vmController.js, aiClient.js, ui.js are already loaded before this file.
 */
(function () {
  "use strict";
  if (window.__scratchCopilotInjected) return;
  window.__scratchCopilotInjected = true;

  const MAX_WAIT_MS = 30000;
  const POLL_MS = 400;
  const TAG = "[ScratchCopilot]";

  /**
   * Scratch GUI sets window.vm after React mounts.
   * We also probe the React fiber tree as a fallback.
   */
  function findVM() {
    if (window.vm && window.vm.runtime) return window.vm;

    // Fallback: look for the VM on the Redux store
    try {
      const storeEl = document.querySelector("[data-redux-store]");
      if (storeEl && storeEl.__redux_store) {
        const state = storeEl.__redux_store.getState();
        if (state && state.scratchGui && state.scratchGui.vm) {
          window.vm = state.scratchGui.vm;
          return window.vm;
        }
      }
    } catch (_) {}

    // Fallback: search React internal fiber for VM instance
    try {
      const stageCanvas = document.querySelector("canvas[class*='stage']")
        || document.querySelector("canvas");
      if (stageCanvas) {
        const fiberKey = Object.keys(stageCanvas).find(k => k.startsWith("__reactFiber$")
          || k.startsWith("__reactInternalInstance$"));
        if (fiberKey) {
          let fiber = stageCanvas[fiberKey];
          for (let i = 0; i < 30 && fiber; i++) {
            if (fiber.memoizedProps && fiber.memoizedProps.vm) {
              window.vm = fiber.memoizedProps.vm;
              return window.vm;
            }
            if (fiber.pendingProps && fiber.pendingProps.vm) {
              window.vm = fiber.pendingProps.vm;
              return window.vm;
            }
            fiber = fiber.return;
          }
        }
      }
    } catch (_) {}

    return null;
  }

  function waitForVM() {
    return new Promise((resolve) => {
      const start = Date.now();

      function poll() {
        const vm = findVM();
        if (vm && vm.runtime && vm.runtime.targets) {
          console.log(TAG, "VM found ✓");
          resolve(vm);
          return;
        }
        if (Date.now() - start > MAX_WAIT_MS) {
          console.warn(TAG, "VM not detected after timeout — UI will still load but VM features may not work.");
          resolve(null);
          return;
        }
        setTimeout(poll, POLL_MS);
      }

      poll();
    });
  }

  async function boot() {
    console.log(TAG, "Booting...");
    
    // Ensure all scripts are exposed
    const components = ["__scratchCopilotVM", "__scratchCopilotAI", "__scratchCopilotUI"];
    for (const name of components) {
      if (!window[name]) {
        console.warn(TAG, `Waiting for ${name}...`);
        await new Promise(r => setTimeout(r, 500));
        if (!window[name]) {
            console.error(TAG, `${name} failed to load!`);
            return;
        }
      }
    }

    console.log(TAG, "Waiting for Scratch VM...");
    const vm = await waitForVM();
    if (vm) window.__scratchCopilotVM.setVM(vm);

    console.log(TAG, "Loading library catalog...");
    try {
      await window.__scratchCopilotVM.loadLibrary();
    } catch (e) {
      console.warn(TAG, "Library load failed:", e);
    }

    console.log(TAG, "Initializing UI...");
    window.__scratchCopilotUI.init(!!vm);
    console.log(TAG, "Boot complete.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
