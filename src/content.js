/**
 * content.js
 * Entry point. Detects VM, loads libraries, and mounts UI.
 */
(function () {
  "use strict";

  if (window.__scratchCopilotInitialised) return;
  window.__scratchCopilotInitialised = true;

  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});

  function detectVM() {
    if (window.vm && window.vm.runtime) return window.vm;
    const all = document.querySelectorAll("*");
    for (let i = 0; i < Math.min(all.length, 500); i++) {
      const el = all[i];
      const key = Object.keys(el).find(k => k.startsWith("__reactFiber$"));
      if (key) {
        let fiber = el[key];
        let depth = 0;
        while (fiber && depth < 50) {
          const vm = fiber.memoizedProps?.vm || fiber.stateNode?.props?.vm;
          if (vm && vm.runtime) return vm;
          fiber = fiber.return;
          depth++;
        }
      }
    }
    return null;
  }

  function bootstrap() {
    if (!/\/projects\/\d+\/editor/.test(window.location.pathname)) return;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const vm = detectVM();
      if (vm || attempts > 200) {
        clearInterval(timer);
        if (vm) {
          SC.vm = vm;
          SC.ui?.mount();
          SC.vmHook?.loadAllLibraries().then(names => {
            SC.ui?.setLibraryNames(names);
          }).catch(console.error);
        } else {
          console.error("[Scratch Copilot] VM not found");
        }
      }
    }, 150);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    setTimeout(bootstrap, 300);
  }
})();
