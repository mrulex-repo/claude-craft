#!/usr/bin/env node
/**
 * PreToolUse hook: snapshot git state before tool execution.
 *
 * Fires before Edit, Write, NotebookEdit, or Bash tool use.
 * Writes .claude/pre_tool_state so change-detector.js can determine
 * whether the tool actually modified files.
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
    fs.mkdirSync(claudeDir, { recursive: true });

    const state = getGitState(cwd);
    fs.writeFileSync(path.join(claudeDir, 'pre_tool_state'), JSON.stringify(state), 'utf8');
  } catch (err) {
    logError('pre-tool-state', err, cwd);
  }
});
