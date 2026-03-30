#!/usr/bin/env node
/**
 * Deploy claude-craft scripts to ~/.claude-craft/ and install dependencies.
 * Runs on SessionStart via hooks.json.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const srcDir = __dirname;
const destDir = path.join(os.homedir(), '.claude-craft');

// Ensure destination directory exists
fs.mkdirSync(destDir, { recursive: true });

// Copy every file from scripts/ except this one
for (const file of fs.readdirSync(srcDir)) {
  if (file === 'setup.js') continue;
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

// Install dependencies only when node_modules is absent
if (!fs.existsSync(path.join(destDir, 'node_modules'))) {
  execSync('npm install --silent', { cwd: destDir, stdio: 'ignore' });
}
