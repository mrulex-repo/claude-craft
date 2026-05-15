#!/usr/bin/env node
/**
 * Background process: show a toast window, then remove the lock file.
 * Spawned detached by notify.js so it outlives the stop hook.
 * argv[2] = agentName, argv[3] = lockFilePath
 *
 * Tries a Python tkinter window first (bottom-right, stays until dismissed).
 * Falls back to a platform dialog if Python or tkinter is unavailable.
 */
'use strict';
const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const [,, agentName, lockFilePath] = process.argv;
const title   = 'Claude Code';
const message = `Agent "${agentName}" has finished.`;

function cleanup() {
  try { fs.unlinkSync(lockFilePath); } catch {}
}

// ── Custom toast window via Python + tkinter ─────────────────────────────────

const windowScript = path.join(os.homedir(), '.claude-craft', 'notifier-window.py');

function tryPythonWindow() {
  for (const py of ['python3', 'python']) {
    const check = spawnSync(py, ['-c', 'import tkinter'], { stdio: 'ignore' });
    if (check.error != null || check.status !== 0) continue;

    const result = spawnSync(py, [windowScript, agentName, lockFilePath], { stdio: 'ignore' });
    if (result.error != null) continue; // spawn failed, try next interpreter

    // Window ran. If it crashed without removing the lock, clean up so
    // future stops can fire.
    if (result.status !== 0) cleanup();
    return true;
  }
  return false;
}

if (tryPythonWindow()) process.exit(0);

// ── Fallback: platform dialog ────────────────────────────────────────────────

const { platform } = process;

function dialog(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'ignore' });
  return result.error == null;
}

if (platform === 'darwin') {
  const safe = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  spawnSync('osascript', ['-e', `display dialog "${safe}" buttons {"OK"} with title "${title}"`], { stdio: 'ignore' });
} else if (platform === 'linux') {
  if (!dialog('zenity', ['--info', `--text=${message}`, `--title=${title}`])) {
    if (!dialog('kdialog', ['--title', title, '--msgbox', message])) {
      dialog('xmessage', ['-center', message]);
    }
  }
} else if (platform === 'win32') {
  const safeMsg   = message.replace(/'/g, "''");
  const safeTitle = title.replace(/'/g, "''");
  spawnSync(
    'powershell',
    ['-WindowStyle', 'Hidden', '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${safeMsg}', '${safeTitle}')`],
    { stdio: 'ignore' }
  );
}

cleanup();
