#!/usr/bin/env node
/**
 * PostToolUse hook: detect file changes by comparing git state.
 *
 * Fires after Edit, Write, NotebookEdit, or Bash tool use.
 * Reads the snapshot written by pre-tool-state.js and compares it
 * against the current git state. Writes .claude/changes_pending if
 * the HEAD commit or working-tree status changed.
 *
 * Fallback when no snapshot exists (pre-tool-state.js didn't run):
 *   - Edit / Write / NotebookEdit → always mark pending (these always modify files)
 *   - Bash → never mark (can't detect without a baseline)
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

function getGitState(cwd) {
  let head = '';
  let status = '';
  try {
    head = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd,
    }).trim();
  } catch {
    // no commits yet or not a git repo
  }
  try {
    status = execSync('git status --porcelain', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd,
    }).trim();
  } catch {
    // not a git repo
  }
  return { head, status };
}

const GITIGNORE_ENTRIES = ['changes_pending', 'pre_tool_state'];

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

const FILE_MODIFYING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

let input = '';
let cwd = process.cwd();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    cwd = data.cwd || cwd;
    const toolName = data.tool_name || '';

    if (!isVerifyEnabled(cwd)) return;

    const projectRoot = findProjectRoot(cwd);
    const claudeDir = path.join(projectRoot, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    ensureGitignoreEntries(claudeDir);

    const statePath = path.join(claudeDir, 'pre_tool_state');
    const pendingPath = path.join(claudeDir, 'changes_pending');

    let changed = false;

    if (fs.existsSync(statePath)) {
      let before;
      try {
        before = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      } catch {
        before = null;
      }
      // Clean up snapshot regardless of outcome
      try { fs.unlinkSync(statePath); } catch { /* ok */ }

      if (before) {
        const after = getGitState(cwd);
        changed = after.head !== before.head || after.status !== before.status;
      } else {
        // Corrupt snapshot — fall back to tool-based heuristic
        changed = FILE_MODIFYING_TOOLS.has(toolName);
      }
    } else {
      // No snapshot — fall back to tool-based heuristic
      changed = FILE_MODIFYING_TOOLS.has(toolName);
    }

    if (changed) {
      fs.writeFileSync(pendingPath, '', 'utf8');
    }
  } catch (err) {
    logError('change-detector', err, cwd);
  }
});
