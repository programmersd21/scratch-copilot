/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

const manifestPath = path.join(__dirname, "..", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const cs = (manifest.content_scripts || [])[0];
if (!cs) fail("manifest.json: missing content_scripts[0]");

const js = cs?.js || [];
if (!Array.isArray(js)) fail("manifest.json: content_scripts[0].js must be an array");

const required = [
  "src/logger.js",
  "src/vmHook.js",
  "src/vmController.js",
  "src/ui.js",
  "src/content.js",
];

for (const file of required) {
  if (!js.includes(file)) fail(`manifest.json: missing '${file}' in content script js list`);
}

for (const file of required) {
  const p = path.join(__dirname, "..", file);
  if (!fs.existsSync(p)) fail(`manifest.json: '${file}' listed but file is missing on disk`);
}

if (js.indexOf("src/vmController.js") > js.indexOf("src/ui.js")) {
  fail("manifest.json: 'src/vmController.js' must load before 'src/ui.js'");
}

if (!process.exitCode) console.log("OK");
