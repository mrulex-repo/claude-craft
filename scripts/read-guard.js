#!/usr/bin/env node
/**
 * PreToolUse hook: block Bash-based reads of plugin implementation files.
 *
 * permissions.deny covers the Read tool, but not Bash commands like
 * `cat ~/.claude-craft/commit-guard.js`. This hook closes that gap.
 *
 * Blocked: shell read utilities, inline node/python fs reads against
 *   ~/.claude-craft/*.js and the plugin cache.
 * Allowed: executing scripts via `node ~/.claude-craft/<script>.js`
 *   (used by hooks and commands).
 */
'use strict';

const os = require('os');
const home = os.homedir();

// Literal path prefixes that should be protected
const PROTECTED = [
  `${home}/.claude-craft/`,
  `${home}/.claude/plugins/cache/claude-craft/`,
  '~/.claude-craft/',
  '~/.claude/plugins/cache/claude-craft/',
];

// Shell commands that read file contents
const SHELL_READ = /\b(cat|head|tail|less|more|bat|strings|hexdump|xxd|od)\b/;

// Inline script reads:  node -e "...readFileSync..."  or  python3 -c "...open(..."
const INLINE_READ = /\b(node\s+-e|python3?\s+-c)\b.*\b(readFileSync|open\s*\()/s;

function touchesProtected(command) {
  return PROTECTED.some(prefix => command.includes(prefix));
}

function isRead(command) {
  return SHELL_READ.test(command) || INLINE_READ.test(command);
}

// Allow: node executing a script file at a protected path
//   e.g.  node ~/.claude-craft/get-config.js [args] && other-stuff
// Block: inline eval (node -e "...readFileSync...") and everything else
function isAllowedExecution(command) {
  if (INLINE_READ.test(command)) return false;
  // node must directly precede the protected path (no pipes/semis between them)
  return /\bnode\b\s+[^|;&\n]*~\/\.claude-craft\/\S+\.js/.test(command) ||
    /\bnode\b\s+[^|;&\n]*\/\.claude\/plugins\/cache\/claude-craft\/\S+\.js/.test(command);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    if (data.tool_name !== 'Bash') return;

    const command = data.tool_input?.command || '';
    if (!touchesProtected(command)) return;
    if (isAllowedExecution(command)) return;
    if (!isRead(command)) return;

    process.stderr.write(
      'Read blocked: plugin implementation files are protected.\n'
    );
    process.exit(2);
  } catch {
    // Never block on a parse error
  }
});
