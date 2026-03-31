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
const yaml = require('js-yaml');
const { logError } = require('./hook-logger');

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
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

let input = '';
let cwd = process.cwd();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    cwd = data.cwd || cwd;

    if (!isVerifyEnabled(cwd)) return;

    const pendingPath = path.join(cwd, '.claude', 'changes_pending');
    fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
    fs.writeFileSync(pendingPath, '', 'utf8');
  } catch (err) {
    logError('change-detector', err, cwd);
  }
});
