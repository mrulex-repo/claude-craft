#!/usr/bin/env node
/**
 * PostToolUse hook: mark that file changes may have occurred.
 *
 * Fires after Edit, Write, NotebookEdit, or Bash tool use.
 * Writes .claude/changes_pending if the verify feature is enabled
 * (verify.enabled = true OR verify.commands is non-empty).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { logError } = require('./hook-logger');

let yaml = null;
try {
  yaml = require(path.join(os.homedir(), '.claude-craft', 'node_modules', 'js-yaml'));
} catch {
  // setup.js hasn't run yet; verify will be treated as disabled
}

function loadYaml(filePath) {
  if (!yaml || !fs.existsSync(filePath)) return null;
  try {
    const config = yaml.load(fs.readFileSync(filePath, 'utf8'));
    return config && typeof config === 'object' ? config : null;
  } catch {
    return null;
  }
}

function findProjectRoot(cwd) {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: cwd || process.cwd(),
    }).trim();
  } catch {
    return cwd || process.cwd();
  }
}

function isVerifyEnabled(cwd) {
  const userConfig = loadYaml(path.join(os.homedir(), '.claude-craft', 'config.yml'));
  const projectConfig = loadYaml(
    path.join(findProjectRoot(cwd), '.claude', 'claude-craft', 'config.yml')
  );

  const userSection = (userConfig && userConfig['verify']) || {};
  const projectSection = (projectConfig && projectConfig['verify']) || {};
  const merged = { ...userSection, ...projectSection };

  if (merged.enabled === true) return true;
  const commands = merged.commands;
  return Array.isArray(commands) && commands.length > 0;
}

const GITIGNORE_ENTRIES = ['changes_pending', 'changes_detected'];

function ensureGitignoreEntries(claudeDir) {
  const gitignorePath = path.join(claudeDir, '.gitignore');
  let existing = '';
  try { existing = fs.readFileSync(gitignorePath, 'utf8'); } catch { /* new file */ }
  const lines = existing ? existing.split('\n') : [];
  const missing = GITIGNORE_ENTRIES.filter(e => !lines.includes(e));
  if (missing.length === 0) return;
  const updated = existing + (existing && !existing.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n';
  fs.writeFileSync(gitignorePath, updated, 'utf8');
}

let input = '';
let cwd = process.cwd();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    cwd = data.cwd || cwd;

    if (!isVerifyEnabled(cwd)) return;

    const claudeDir = path.join(findProjectRoot(cwd), '.claude');
    const pendingPath = path.join(claudeDir, 'changes_pending');
    fs.mkdirSync(claudeDir, { recursive: true });
    ensureGitignoreEntries(claudeDir);
    fs.writeFileSync(pendingPath, '', 'utf8');
  } catch (err) {
    logError('change-detector', err, cwd);
  }
});
