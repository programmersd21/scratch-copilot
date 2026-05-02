/**
 * variableManager.js
 * Full variable, list, and broadcast management.
 * Local (sprite) and global (Stage) scope support.
 */
(function () {
  "use strict";
  const SC = (window.ScratchCopilot = window.ScratchCopilot || {});
  const log = SC.logger?.createLogger("varMgr") || console;
  const hook = () => SC.vmHook;

  function createScratchVariable(target, id, name, type, value) {
    if (typeof target.createVariable === "function") {
      target.createVariable(id, name, type || "", false);
    } else {
      target.variables[id] = { id, name, value, type: type || "" };
    }
    const variable = target.variables[id] || target.lookupVariableById?.(id);
    if (variable) variable.value = value;
    return variable;
  }

  // ─── Variables ──────────────────────────────────────────────────────────
  function createVariable(spriteName, varName, initialValue = 0) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const exists = Object.values(target.variables).find(
      v => v.name === varName && (!v.type || v.type === "" || v.type === "scalar")
    );
    if (exists) { exists.value = initialValue; h.safeEmitWorkspaceUpdate(vm); return; }
    const id = h.uid();
    createScratchVariable(target, id, varName, "", initialValue);
    h.safeEmitWorkspaceUpdate(vm);
    log.info(`Created variable "${varName}" on "${spriteName}"`);
  }

  function setVariable(spriteName, varName, value) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const v = Object.values(target.variables).find(v => v.name === varName && (!v.type || v.type === ""));
    if (!v) throw new Error(`Variable "${varName}" not found on "${spriteName}"`);
    v.value = value;
    h.safeEmitWorkspaceUpdate(vm);
  }

  function getVariable(spriteName, varName) {
    const h = hook();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const v = Object.values(target.variables).find(v => v.name === varName && (!v.type || v.type === ""));
    if (!v) throw new Error(`Variable "${varName}" not found`);
    return v.value;
  }

  function deleteVariable(spriteName, varName) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const entry = Object.entries(target.variables).find(([, v]) => v.name === varName && (!v.type || v.type === ""));
    if (!entry) return;
    if (typeof target.deleteVariable === "function") target.deleteVariable(entry[0]);
    else delete target.variables[entry[0]];
    h.safeEmitWorkspaceUpdate(vm);
    log.info(`Deleted variable "${varName}" from "${spriteName}"`);
  }

  function listVariables(spriteName) {
    const h = hook();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    return Object.values(target.variables)
      .filter(v => !v.type || v.type === "" || v.type === "scalar")
      .map(v => ({ name: v.name, value: v.value }));
  }

  // ─── Lists ──────────────────────────────────────────────────────────────
  function createList(spriteName, listName, initialValues = []) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const exists = Object.values(target.variables).find(v => v.name === listName && v.type === "list");
    if (exists) { exists.value = initialValues; h.safeEmitWorkspaceUpdate(vm); return; }
    const id = h.uid();
    createScratchVariable(target, id, listName, "list", initialValues);
    h.safeEmitWorkspaceUpdate(vm);
    log.info(`Created list "${listName}" on "${spriteName}"`);
  }

  function getList(spriteName, listName) {
    const h = hook();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const v = Object.values(target.variables).find(v => v.name === listName && v.type === "list");
    if (!v) throw new Error(`List "${listName}" not found`);
    return Array.isArray(v.value) ? [...v.value] : [];
  }

  function setList(spriteName, listName, values) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const v = Object.values(target.variables).find(v => v.name === listName && v.type === "list");
    if (!v) throw new Error(`List "${listName}" not found`);
    v.value = Array.isArray(values) ? values : [values];
    h.safeEmitWorkspaceUpdate(vm);
  }

  function appendToList(spriteName, listName, item) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const v = Object.values(target.variables).find(v => v.name === listName && v.type === "list");
    if (!v) throw new Error(`List "${listName}" not found`);
    if (!Array.isArray(v.value)) v.value = [];
    v.value.push(item);
    h.safeEmitWorkspaceUpdate(vm);
  }

  function deleteList(spriteName, listName) {
    const h = hook(); const vm = h.requireVM();
    const target = h.resolveTarget(spriteName);
    if (!target) throw new Error(`Sprite "${spriteName}" not found`);
    const entry = Object.entries(target.variables).find(([, v]) => v.name === listName && v.type === "list");
    if (!entry) return;
    if (typeof target.deleteVariable === "function") target.deleteVariable(entry[0]);
    else delete target.variables[entry[0]];
    h.safeEmitWorkspaceUpdate(vm);
    log.info(`Deleted list "${listName}" from "${spriteName}"`);
  }

  // ─── Broadcasts ─────────────────────────────────────────────────────────
  function createBroadcast(msgName) {
    const h = hook(); const vm = h.requireVM();
    const stage = h.getStageTarget();
    if (!stage) throw new Error("Stage not found");
    const exists = Object.values(stage.variables).find(v => v.name === msgName && v.type === "broadcast_msg");
    if (exists) return;
    const id = h.uid();
    createScratchVariable(stage, id, msgName, "broadcast_msg", msgName);
    h.safeEmitWorkspaceUpdate(vm);
    log.info(`Created broadcast "${msgName}"`);
  }

  function listBroadcasts() {
    const h = hook();
    const stage = h.getStageTarget();
    if (!stage) return [];
    return Object.values(stage.variables)
      .filter(v => v.type === "broadcast_msg")
      .map(v => v.name);
  }

  SC.variableManager = {
    createVariable, setVariable, getVariable, deleteVariable, listVariables,
    createList, getList, setList, appendToList, deleteList,
    createBroadcast, listBroadcasts,
  };
  log.info("variableManager loaded");
})();
