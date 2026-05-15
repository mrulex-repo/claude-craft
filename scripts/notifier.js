#!/usr/bin/env node
/**
 * Background process: send an OS notification, then remove the lock file.
 * Spawned detached by notify.js so it outlives the stop hook.
 * argv[2] = agentName, argv[3] = lockFilePath
 *
 * Linux:   notify-send with urgency=critical (persistent on most daemons).
 *          Replaces the previous notification for this agent via --replace-id
 *          so at most one notification per agent appears at a time.
 * macOS:   osascript display notification (Notification Center, top-right).
 * Windows: PowerShell NotifyIcon balloon tip (system tray, bottom-right).
 */
'use strict';
const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const [,, agentName, lockFilePath] = process.argv;
const title   = 'Claude Code';
const message = `${agentName} has finished.`;

function cleanup() {
  try { fs.unlinkSync(lockFilePath); } catch {}
}

const { platform } = process;

if (platform === 'linux') {
  // Persist the notification ID so subsequent stops replace the same slot.
  const idFile = path.join(path.dirname(lockFilePath), 'notify_id');
  const args = [
    '--urgency=critical',
    `--app-name=${title}`,
    '--icon=dialog-information',
  ];

  try {
    const stored = fs.readFileSync(idFile, 'utf8').trim();
    if (stored) args.push(`--replace-id=${stored}`);
  } catch {}

  // --print-id returns the notification ID (libnotify ≥ 0.7.9)
  const result = spawnSync('notify-send', [...args, '--print-id', title, message], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.error || result.status !== 0) {
    // --print-id not supported — retry without it
    spawnSync('notify-send', [...args, title, message], { stdio: 'ignore' });
  } else if (result.stdout && result.stdout.trim()) {
    try { fs.writeFileSync(idFile, result.stdout.trim(), 'utf8'); } catch {}
  }

} else if (platform === 'darwin') {
  const safe = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  spawnSync('osascript', [
    '-e', `display notification "${safe}" with title "${title}"`,
  ], { stdio: 'ignore' });

} else if (platform === 'win32') {
  const safeMsg   = message.replace(/'/g, "''");
  const safeTitle = title.replace(/'/g, "''");
  // NotifyIcon balloon tip appears from the system tray (bottom-right).
  // The process must stay alive while the balloon is visible.
  spawnSync('powershell', [
    '-WindowStyle', 'Hidden', '-Command',
    `Add-Type -AssemblyName System.Windows.Forms;
     $n = New-Object System.Windows.Forms.NotifyIcon;
     $n.Icon = [System.Drawing.SystemIcons]::Information;
     $n.Visible = $true;
     $n.ShowBalloonTip(10000, '${safeTitle}', '${safeMsg}', [System.Windows.Forms.ToolTipIcon]::Info);
     Start-Sleep -Seconds 11;
     $n.Dispose()`,
  ], { stdio: 'ignore' });
}

cleanup();
