#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const cliPath = path.join(__dirname, "..", "dist", "scan.js");
const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
