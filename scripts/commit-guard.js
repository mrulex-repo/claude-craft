#!/usr/bin/env node
/**
 * PreToolUse + PostToolUse hook: guard git commit against unauthorized execution.
 *
 * When auto-approval is disabled (default), blocks any `git commit` that was not
 * initiated through the /commit-msg command. Approval is tracked via a project-local
 * marker file that persists across sessions and reboots:
 *   <cwd>/.claude/commit_approved
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { logError } = require('./hook-logger');

function isAutoApprovalEnabled() {
  try {
    const configPath = path.join(os.homedir(), '.claude-craft', 'config.yml');
    const content = fs.readFileSync(configPath, 'utf8');
    return /auto-approval\s*:\s*true/i.test(content);
  } catch {
    return false;
  }
}

function getMarkerPath(cwd) {
  return path.join(cwd || process.cwd(), '.claude', 'commit_approved');
}

function isGitCommit(command) {
  return /\bgit\s+commit\b/.test(command || '');
}

function isApproveCommit(command) {
  return /approve-commit\.js/.test(command || '');
}

let input = '';
let cwd = process.cwd();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const { hook_event_name, tool_name, tool_input } = data;
    cwd = data.cwd || cwd;

    if (tool_name !== 'Bash') return;

    if (isApproveCommit(tool_input?.command)) {
      if (!/--from-workflow/.test(tool_input?.command)) {
        process.stderr.write(
          'approve-commit blocked: must be called through the /commit-msg workflow.\n'
        );
        process.exit(2);
      }
      return; // flag present — allow through
    }

    if (!isGitCommit(tool_input?.command)) return;
    if (isAutoApprovalEnabled()) return;

    const markerPath = getMarkerPath(cwd);

    if (hook_event_name === 'PreToolUse') {
      if (!fs.existsSync(markerPath)) {
        process.stderr.write(
          'Commit blocked: not approved. Use /commit-msg to stage and approve before committing.\n'
        );
        process.exit(2);
      }
      const approvedHash = fs.readFileSync(markerPath, 'utf8').trim();
      const currentHash = execSync('git write-tree', { cwd: cwd || process.cwd(), encoding: 'utf8' }).trim();
      if (currentHash !== approvedHash) {
        process.stderr.write(
          'Commit blocked: staged changes differ from approved snapshot. Re-run /commit-msg to re-approve.\n'
        );
        process.exit(2);
      }
    } else if (hook_event_name === 'PostToolUse') {
      try { fs.unlinkSync(markerPath); } catch { /* ok if already gone */ }
    }
  } catch (err) {
    logError('commit-guard', err, cwd);
  }
});
