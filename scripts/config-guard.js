#!/usr/bin/env node
/**
 * PreToolUse hook: block modifications to claude-craft and Claude configuration files.
 *
 * Configuration files are sensitive — changes can silently alter Claude's behavior,
 * permissions, or plugin settings. This guard ensures that even in auto-approval
 * (yolo/dangerouslySkipPermissions) mode, Claude cannot modify config files without
 * the user explicitly directing it through the proper channel (/config command).
 *
 * Protected:
 *   - ~/.claude-craft/config.yml                 (user-level claude-craft config)
 *   - ~/.claude/settings.json                    (Claude global settings)
 *   - ~/.claude/settings.local.json              (Claude local settings)
 *   - <project>/.claude/claude-craft/config.yml  (project-level claude-craft config)
 *
 * Allowed:
 *   - node ... set-config.js ...  (/config command's backend — explicit user request)
 *   - node ... setup.js ...       (session-init bootstrap for settings.json)
 */
'use strict';

const path = require('path');
const os = require('os');
const { logError } = require('./hook-logger');

const home = os.homedir();

const PROTECTED_ABSOLUTE = [
  path.join(home, '.claude-craft', 'config.yml'),
  path.join(home, '.claude', 'settings.json'),
  path.join(home, '.claude', 'settings.local.json'),
];

// Tilde forms of the same paths (as they may appear in Bash commands)
const PROTECTED_TILDE = PROTECTED_ABSOLUTE.map(p => p.replace(home, '~'));

// Project-level config: any path ending in .claude/claude-craft/config.yml
const PROJECT_CONFIG_RE = /(?:^|\/)\.claude\/claude-craft\/config\.yml$/;

function resolveHome(p) {
  if (!p) return '';
  return p.startsWith('~/') ? path.join(home, p.slice(2)) : p;
}

/**
 * Returns true if filePath (absolute or ~-prefixed) is a protected config file.
 */
function isProtectedConfig(filePath) {
  const resolved = resolveHome(filePath);
  if (PROTECTED_ABSOLUTE.includes(resolved)) return true;
  if (PROJECT_CONFIG_RE.test(resolved)) return true;
  return false;
}

/**
 * Returns true if the Bash command string references any protected config path.
 */
function touchesProtectedConfig(command) {
  for (let i = 0; i < PROTECTED_ABSOLUTE.length; i++) {
    if (command.includes(PROTECTED_ABSOLUTE[i])) return true;
    if (command.includes(PROTECTED_TILDE[i])) return true;
  }
  return PROJECT_CONFIG_RE.test(command);
}

/**
 * Returns true if this is a legitimate config-writing script invocation.
 * Allowed: `node <path>/set-config.js` and `node <path>/setup.js`
 * Not allowed: inline eval (node -e) or other scripts.
 */
function isAllowedScript(command) {
  if (/\bnode\s+-e\b/.test(command)) return false;
  return (
    /\bnode\b\s+[^|;&\n]*set-config\.js\b/.test(command) ||
    /\bnode\b\s+[^|;&\n]*setup\.js\b/.test(command)
  );
}

/**
 * Returns true if the Bash command contains a write operation.
 * Covers: output redirection, sed -i, tee, cp, mv, truncate, install,
 * and inline script evaluation (node -e / python -c can trivially write files).
 */
const WRITE_RE = /(?:>)|(?:\bsed\s+(?:-\w*i\w*\s|--in-place\b))|(?:\btee\b)|(?:\bcp\b)|(?:\bmv\b)|(?:\btruncate\b)|(?:\binstall\b)|(?:\bnode\s+-e\b)|(?:\bpython3?\s+-c\b)/;

function isWriteOperation(command) {
  return WRITE_RE.test(command);
}

const BLOCKED_MSG =
  'Config write blocked: protected configuration file cannot be modified by the agent.\n' +
  'To change settings, use /config or explicitly ask and the agent will use the /config command.\n';

let input = '';
let cwd = process.cwd();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const { tool_name, tool_input } = data;
    cwd = data.cwd || cwd;

    // Edit and Write tools: check file_path directly
    if (tool_name === 'Edit' || tool_name === 'Write') {
      const filePath = tool_input?.file_path || '';
      if (!isProtectedConfig(filePath)) return;
      process.stderr.write(BLOCKED_MSG);
      process.exit(2);
    }

    // Bash: detect write operations against protected config paths
    if (tool_name === 'Bash') {
      const command = tool_input?.command || '';
      if (!touchesProtectedConfig(command)) return;
      if (isAllowedScript(command)) return;
      if (!isWriteOperation(command)) return;
      process.stderr.write(BLOCKED_MSG);
      process.exit(2);
    }
  } catch (err) {
    logError('config-guard', err, cwd);
  }
});
