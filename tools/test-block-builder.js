const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "blockBuilder.js"), "utf8");

const context = {
  console,
  window: { ScratchCopilot: { logger: { createLogger: () => console } } },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: "blockBuilder.js" });

const SC = context.window.ScratchCopilot;
let uid = 0;
const stage = {
  id: "stage",
  isStage: true,
  variables: {},
  blocks: {
    _blocks: {},
    _scripts: [],
    resetCache() {},
    updateTargetSpecificBlocks() {},
    toXML() {},
  },
  createVariable(id, name, type) {
    this.variables[id] = { id, name, type: type || "", value: type === "list" ? [] : 0 };
  },
};
const target = {
  id: "sprite",
  isStage: false,
  variables: {},
  blocks: {
    _blocks: {},
    _scripts: [],
    resetCache() {},
    updateTargetSpecificBlocks() {},
    toXML() {},
  },
  createVariable(id, name, type) {
    this.variables[id] = { id, name, type: type || "", value: type === "list" ? [] : 0 };
  },
};
const loadedExtensions = [];
const fakeVM = {
  editingTarget: target.id,
  runtime: {
    _primitives: {},
    targets: [stage, target],
    emitProjectChanged() {},
  },
  stopAll() {},
  setEditingTarget() {},
};

SC.vmHook = {
  uid: () => `id_${++uid}`,
  requireVM: () => fakeVM,
  resolveTarget: () => target,
  getStageTarget: () => stage,
  safeEmitWorkspaceUpdate: () => true,
};
SC.extensionLoader = {
  isLoaded: () => false,
  loadExtension: async (id) => loadedExtensions.push(id),
};

function findByOpcode(blockMap, opcode) {
  return Object.values(blockMap).find((block) => block.opcode === opcode);
}

{
  const { blockMap } = SC.blockBuilder.buildBlockMap([
    { opcode: "event_whenflagclicked" },
    {
      opcode: "looks_sayforsecs",
      inputs: {
        MESSAGE: [1, [13, "operator_join"]],
        SECS: [1, [4, 2]],
      },
    },
  ], target);
  const say = findByOpcode(blockMap, "looks_sayforsecs");
  const messageBlock = blockMap[say.inputs.MESSAGE.block];
  assert.equal(messageBlock.opcode, "operator_join");
  assert.ok(messageBlock.inputs.STRING1, "operator_join should get default STRING1");
  assert.ok(messageBlock.inputs.STRING2, "operator_join should get default STRING2");
  assert.equal(findByOpcode(blockMap, "data_listcontents"), undefined);
}

{
  const { blockMap } = SC.blockBuilder.buildBlockMap([
    { opcode: "event_whenflagclicked" },
    {
      opcode: "control_repeat",
      inputs: {
        TIMES: [1, [6, 48]],
        SUBSTACK: [2, [
          { opcode: "data_changevariableby", fields: { VARIABLE: ["x", null] }, inputs: { VALUE: [1, [4, 10]] } },
          { opcode: "pen_stamp" },
        ]],
      },
    },
  ], target);
  const repeat = findByOpcode(blockMap, "control_repeat");
  const firstBodyBlock = blockMap[repeat.inputs.SUBSTACK.block];
  assert.equal(firstBodyBlock.opcode, "data_changevariableby");
  assert.equal(blockMap[firstBodyBlock.next].opcode, "pen_stamp");
}

{
  const exts = SC.blockBuilder.inferExtensionsFromScripts([
    [{ opcode: "pen_clear" }, { opcode: "video_sensing_video_on" }],
  ]);
  assert.deepEqual(new Set(exts), new Set(["pen", "videoSensing"]));
}

(async () => {
  await SC.blockBuilder.injectBlocks("Sprite1", [
    [
      { opcode: "event_whenflagclicked" },
      { opcode: "pen_clear" },
      { opcode: "pen_setPenColorTo", inputs: { COLOR: [1, [9, "#00ff00"]] } },
    ],
  ]);
  assert.ok(loadedExtensions.includes("pen"));
  assert.equal(target.blocks._scripts.length, 1);
  assert.ok(findByOpcode(target.blocks._blocks, "pen_setPenColorToColor"));
  console.log("blockBuilder regression checks passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
