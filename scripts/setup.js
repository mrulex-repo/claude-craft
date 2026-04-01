#!/usr/bin/env node
/**
 * Deploy claude-craft scripts to ~/.claude-craft/ and install dependencies.
 * Also configures ~/.claude/settings.json to deny Read access to plugin scripts,
 * preventing Claude from inspecting internal implementation details.
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

// Copy every file from scripts/ except this one (skip directories)
for (const file of fs.readdirSync(srcDir)) {
  if (file === 'setup.js') continue;
  const srcPath = path.join(srcDir, file);
  if (!fs.statSync(srcPath).isFile()) continue;
  fs.copyFileSync(srcPath, path.join(destDir, file));
}

// Install dependencies only when node_modules is absent
if (!fs.existsSync(path.join(destDir, 'node_modules'))) {
  execSync('npm install --silent', { cwd: destDir, stdio: 'ignore' });
}

// ── Deny Read access to plugin scripts in ~/.claude/settings.json ────────────
//
// Prevents Claude from reading the internal scripts that implement the commit
// guard, so bypass mechanisms (like the --from-workflow flag) stay hidden.

const DENY_PATTERNS = [
  'Read(~/.claude-craft/*.js)',
  'Read(~/.claude/plugins/cache/claude-craft/**)',
];

const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

try {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      // Unparseable settings — leave unchanged
      process.exit(0);
    }
  }

  if (!settings.permissions) settings.permissions = {};
  if (!Array.isArray(settings.permissions.deny)) settings.permissions.deny = [];

  const existing = new Set(settings.permissions.deny);
  const added = DENY_PATTERNS.filter(p => !existing.has(p));

  if (added.length > 0) {
    settings.permissions.deny.push(...added);
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }
} catch {
  // Never crash the session over a settings update failure
}
