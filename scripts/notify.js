#!/usr/bin/env node
/**
 * Stop hook (last): show an OS notification when the agent finishes.
 * Opt-in via notify.enabled config. Uses a per-project lock file to suppress
 * duplicate notifications while one is already visible.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync, spawn } = require('child_process');

let yaml = null;
try {
  yaml = require(path.join(os.homedir(), '.claude-craft', 'node_modules', 'js-yaml'));
} catch {
  process.exit(0);
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
      cwd,
    }).trim();
  } catch {
    return cwd;
  }
}

/**
 * Best-effort focus detection. Returns true if the user is actively looking
 * at this session, meaning a notification would be redundant.
 *
 * tmux: reliable — checks whether our pane and window are both active.
 * Non-tmux: no cross-platform mechanism; always returns false (notify anyway).
 */
function isSessionFocused() {
  const tmuxPane = process.env.TMUX_PANE;
  if (!tmuxPane || !process.env.TMUX) return false;
  try {
    const out = spawnSync(
      'tmux', ['display-message', '-t', tmuxPane, '-p', '#{pane_active}#{window_active}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return out.stdout && out.stdout.trim() === '11';
  } catch {
    return false;
  }
}

function getNotifyConfig(cwd) {
  const userConfig = loadYaml(path.join(os.homedir(), '.claude-craft', 'config.yml'));
  const projectConfig = loadYaml(
    path.join(findProjectRoot(cwd), '.claude', 'claude-craft', 'config.yml')
  );
  const userSection = (userConfig && userConfig['notify']) || {};
  const projectSection = (projectConfig && projectConfig['notify']) || {};
  return { ...userSection, ...projectSection };
}

let input = '';
let cwd = process.cwd();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    cwd = data.cwd || cwd;

    const projectRoot = findProjectRoot(cwd);
    const config = getNotifyConfig(cwd);

    if (!config.enabled) return;
    if (isSessionFocused()) return;

    const lockFile = path.join(projectRoot, '.claude', 'notification_pending');
    if (fs.existsSync(lockFile)) return;

    fs.writeFileSync(lockFile, '', 'utf8');

    const agentName = path.basename(projectRoot);
    const notifierScript = path.join(os.homedir(), '.claude-craft', 'notifier.js');

    spawn(process.execPath, [notifierScript, agentName, lockFile], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch {
    // Never crash the session
  }
});
