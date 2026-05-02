/**
 * projectSerializer.js
 * Read, write, patch, and export/import full Scratch project JSON.
 * Also handles .sb3 file generation and loading.
 */
(function () {
  "use strict";
  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("projSerial") || console;
  const hook = () => SC.vmHook;

  // ─── Export project JSON ────────────────────────────────────────────────
  function getProjectJSON() {
    const vm = hook().requireVM();
    return vm.toJSON();
  }

  function getProjectObject() {
    return JSON.parse(getProjectJSON());
  }

  // ─── Import / Load project JSON ────────────────────────────────────────
  async function loadProjectJSON(jsonString) {
    const vm = hook().requireVM();
    const json = typeof jsonString === "string" ? jsonString : JSON.stringify(jsonString);
    await vm.loadProject(json);
    hook().safeEmitWorkspaceUpdate(vm);
    log.info("Loaded project from JSON");
  }

  // ─── Patch project (merge partial JSON) ─────────────────────────────────
  function patchProject(patches) {
    const vm = hook().requireVM();
    const project = JSON.parse(vm.toJSON());

    if (patches.targets) {
      for (const patch of patches.targets) {
        const target = project.targets.find(
          t => (t.isStage && patch.isStage) || t.name === patch.name
        );
        if (target) Object.assign(target, patch);
      }
    }
    if (patches.extensions) {
      project.extensions = [...new Set([...(project.extensions || []), ...patches.extensions])];
    }
    if (patches.meta) {
      project.meta = { ...(project.meta || {}), ...patches.meta };
    }

    return project;
  }

  // ─── Export as .sb3 download ────────────────────────────────────────────
  async function exportSB3(filename = "project.sb3") {
    const vm = hook().requireVM();

    // Use VM's built-in saveProjectSb3 if available
    let blob;
    if (typeof vm.saveProjectSb3 === "function") {
      const data = await vm.saveProjectSb3();
      blob = new Blob([data], { type: "application/x.scratch.sb3" });
    } else {
      // Fallback: just export JSON
      const json = vm.toJSON();
      blob = new Blob([json], { type: "application/json" });
      filename = filename.replace(".sb3", ".json");
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log.info(`Exported project as "${filename}"`);
  }

  // ─── Import .sb3 from file input ───────────────────────────────────────
  async function importSB3(file) {
    const vm = hook().requireVM();
    const buffer = await file.arrayBuffer();
    await vm.loadProject(buffer);
    hook().safeEmitWorkspaceUpdate(vm);
    log.info(`Imported project from file "${file.name}"`);
  }

  // ─── Import from URL ───────────────────────────────────────────────────
  async function importFromURL(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch project: HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const vm = hook().requireVM();
    await vm.loadProject(buffer);
    hook().safeEmitWorkspaceUpdate(vm);
    log.info(`Imported project from URL`);
  }

  // ─── Project Stats ─────────────────────────────────────────────────────
  function getProjectStats() {
    const vm = hook().requireVM();
    const targets = vm.runtime.targets;
    let totalBlocks = 0, totalVars = 0, totalLists = 0, totalCostumes = 0, totalSounds = 0;
    for (const t of targets) {
      totalBlocks += Object.keys(t.blocks._blocks || {}).length;
      for (const v of Object.values(t.variables)) {
        if (v.type === "list") totalLists++;
        else if (!v.type || v.type === "" || v.type === "scalar") totalVars++;
      }
      totalCostumes += t.sprite.costumes.length;
      totalSounds += t.sprite.sounds.length;
    }
    return {
      spriteCount: targets.filter(t => !t.isStage).length,
      totalBlocks, totalVars, totalLists, totalCostumes, totalSounds,
      extensions: SC.extensionLoader?.listLoaded() || [],
    };
  }

  SC.projectSerializer = {
    getProjectJSON, getProjectObject, loadProjectJSON,
    patchProject, exportSB3, importSB3, importFromURL, getProjectStats,
  };
  log.info("projectSerializer loaded");
})();
