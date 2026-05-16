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

// Terminal emulators that expose their window title via AT-SPI (GTK/accessible).
// The window title reflects the active tab's shell prompt ("user@host:~/path").
const ATSPI_TERMINALS = [
  'tilix',
  'gnome-terminal-server',
  'gnome-terminal',
  'terminator',
  'xfce4-terminal',
  'lxterminal',
  'mate-terminal',
  'io.elementary.terminal',
  'kitty',
  'wezterm-gui',
];

/**
 * Best-effort focus detection. Returns true if the user is actively looking
 * at this session, meaning a notification would be redundant.
 *
 * tmux:    reliable — checks whether our pane and window are both active.
 * Linux:   AT-SPI (GTK/accessible terminals) → X11 xprop fallback.
 * macOS:   osascript reads the frontmost window title.
 * Other:   always returns false (notify anyway).
 */
function isSessionFocused(cwd) {
  const tmuxPane = process.env.TMUX_PANE;
  if (tmuxPane && process.env.TMUX) {
    try {
      const out = spawnSync(
        'tmux', ['display-message', '-t', tmuxPane, '-p', '#{pane_active}#{window_active}'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      if (out.stdout && out.stdout.trim() === '11') return true;
    } catch {}
  }

  if (!cwd) return false;

  if (process.platform === 'linux') {
    try { if (isAtspiTerminalFocused(cwd)) return true; } catch {}
    try { if (isX11TerminalFocused(cwd)) return true; } catch {}
  }

  if (process.platform === 'darwin') {
    try { if (isMacOsFocused(cwd)) return true; } catch {}
  }

  return false;
}

/**
 * Walk /proc upward from our pid to find an ancestor whose comm is in the
 * given set. Returns { pid, comm } or null.
 */
function findAncestorByComm(names) {
  const nameSet = new Set(names);
  let pid = process.pid;
  for (let i = 0; i < 15; i++) {
    try {
      const comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
      if (nameSet.has(comm)) return { pid, comm };
      const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^PPid:\s*(\d+)/m);
      if (!m) break;
      const ppid = parseInt(m[1]);
      if (ppid <= 1) break;
      pid = ppid;
    } catch { break; }
  }
  return null;
}

/**
 * Check if targetPid is an ancestor (or self) of our process.
 */
function isAncestorPid(targetPid) {
  let pid = process.pid;
  for (let i = 0; i < 20; i++) {
    if (pid === targetPid) return true;
    try {
      const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^PPid:\s*(\d+)/m);
      if (!m) break;
      const ppid = parseInt(m[1]);
      if (ppid <= 1) break;
      pid = ppid;
    } catch { break; }
  }
  return false;
}

/**
 * Get the AT-SPI accessibility bus address.
 */
function getAtspiAddress() {
  const result = spawnSync(
    'gdbus', ['call', '--session', '--dest', 'org.a11y.Bus',
      '--object-path', '/org/a11y/bus', '--method', 'org.a11y.Bus.GetAddress'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }
  );
  return (result.stdout || '').match(/unix:[^\s')]+/)?.[0] || null;
}

/**
 * Find an application's AT-SPI service name by PID, with a pid-keyed cache
 * in /tmp so subsequent hook calls skip the full service scan (~68 ms cold).
 */
function findAtspiService(atspiAddr, targetPid) {
  const cacheFile = path.join(os.tmpdir(), `cc-atspi-svc-${targetPid}`);

  try {
    const cached = fs.readFileSync(cacheFile, 'utf8').trim();
    const check = spawnSync(
      'gdbus', ['call', '--address', atspiAddr, '--dest', 'org.freedesktop.DBus',
        '--object-path', '/', '--method', 'org.freedesktop.DBus.GetConnectionUnixProcessID',
        cached],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 500 }
    );
    if (parseInt((check.stdout || '').match(/uint32 (\d+)/)?.[1]) === targetPid) return cached;
  } catch {}

  const listResult = spawnSync(
    'gdbus', ['call', '--address', atspiAddr, '--dest', 'org.freedesktop.DBus',
      '--object-path', '/', '--method', 'org.freedesktop.DBus.ListNames'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }
  );
  for (const svc of (listResult.stdout || '').match(/:[\d.]+/g) || []) {
    const pidResult = spawnSync(
      'gdbus', ['call', '--address', atspiAddr, '--dest', 'org.freedesktop.DBus',
        '--object-path', '/', '--method', 'org.freedesktop.DBus.GetConnectionUnixProcessID',
        svc],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 500 }
    );
    if (parseInt((pidResult.stdout || '').match(/uint32 (\d+)/)?.[1]) === targetPid) {
      try { fs.writeFileSync(cacheFile, svc, 'utf8'); } catch {}
      return svc;
    }
  }
  return null;
}

/**
 * AT-SPI focus detection for GTK/accessible terminal emulators.
 *
 * These terminals register their window title with the AT-SPI accessibility
 * bus. The title reflects the active tab's shell prompt ("user@host:~/path").
 * We walk the process tree to find a known terminal ancestor, look up its
 * AT-SPI service, read its window title, and compare the path against cwd.
 */
function isAtspiTerminalFocused(cwd) {
  const ancestor = findAncestorByComm(ATSPI_TERMINALS);
  if (!ancestor) return false;

  const atspiAddr = getAtspiAddress();
  if (!atspiAddr) return false;

  const service = findAtspiService(atspiAddr, ancestor.pid);
  if (!service) return false;

  const titleResult = spawnSync(
    'gdbus', ['call', '--address', atspiAddr, '--dest', service,
      '--object-path', '/org/a11y/atspi/accessible/1',
      '--method', 'org.freedesktop.DBus.Properties.Get',
      'org.a11y.atspi.Accessible', 'Name'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }
  );
  const rawTitle = (titleResult.stdout || '').match(/<'([^']+)'>/)?.[1];
  if (!rawTitle) return false;

  return terminalTitleMatchesCwd(rawTitle, cwd);
}

/**
 * X11 focus detection via xprop.
 *
 * Reads _NET_ACTIVE_WINDOW, then checks whether the window's _NET_WM_PID
 * is an ancestor of our process and its _NET_WM_NAME matches our cwd.
 * Returns false cleanly on Wayland (xprop reports 0x0 for the active window).
 */
function isX11TerminalFocused(cwd) {
  const rootResult = spawnSync(
    'xprop', ['-root', '_NET_ACTIVE_WINDOW'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000 }
  );
  const winId = (rootResult.stdout || '').match(/0x[0-9a-f]+/i)?.[0];
  if (!winId || winId === '0x0') return false;

  const winResult = spawnSync(
    'xprop', ['-id', winId, '_NET_WM_PID', '_NET_WM_NAME'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000 }
  );
  const out = winResult.stdout || '';
  const winPid = parseInt((out.match(/_NET_WM_PID.*?=\s*(\d+)/) || [])[1]);
  const winTitle = (out.match(/_NET_WM_NAME.*?=\s*"(.*)"/) || [])[1];
  if (!winPid || !winTitle) return false;

  if (!isAncestorPid(winPid)) return false;

  return terminalTitleMatchesCwd(winTitle, cwd);
}

/**
 * macOS focus detection via osascript.
 *
 * Reads the front window title of the frontmost application and matches
 * the path component against our cwd.
 */
function isMacOsFocused(cwd) {
  const script = [
    'tell application "System Events"',
    '  set fa to name of first application process whose frontmost is true',
    '  set wt to ""',
    '  try',
    '    set wt to name of front window of process fa',
    '  end try',
    '  return fa & "|" & wt',
    'end tell',
  ].join('\n');

  const result = spawnSync('osascript', ['-e', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 3000,
  });
  const output = (result.stdout || '').trim();
  if (!output) return false;

  const sepIdx = output.indexOf('|');
  if (sepIdx === -1) return false;
  const winTitle = output.slice(sepIdx + 1).trim();
  if (!winTitle) return false;

  return terminalTitleMatchesCwd(winTitle, cwd);
}

/**
 * Parse a terminal window title and check if its path component matches cwd.
 *
 * Searches for these patterns anywhere in the title, which naturally handles
 * app-name prefixes like "Tilix: " without special-casing:
 *   "user@host:~/path"    — bash PS1 with hostname (contains '@' before ':')
 *   "/absolute/path"      — PS1 showing full path
 *   "~/path"              — PS1 showing tilde-relative path
 *
 * Bare dirnames are intentionally not matched: they are indistinguishable
 * from user-set custom tab titles.
 *
 * Titles with spaces (e.g. running-process spinners) don't match the
 * user@host: pattern and don't start with / or ~, so they fall through cleanly.
 */
function terminalTitleMatchesCwd(title, cwd) {
  // "user@host:~/path" or "user@host:/abs/path" — found anywhere in the title
  const userHostMatch = title.match(/[^@\s]+@[^:\s]+:(~\/.*|~|\/.+)/);
  if (userHostMatch) {
    const rawPath = userHostMatch[1];
    const expanded = rawPath.startsWith('~') ? os.homedir() + rawPath.slice(1) : rawPath;
    return expanded === cwd;
  }

  // Bare absolute or tilde path at the start or after a space/colon
  const pathMatch = title.match(/(?:^|[: ])(~\/[^\s]*|~|\/.+)/);
  if (pathMatch) {
    const rawPath = pathMatch[1];
    const expanded = rawPath.startsWith('~') ? os.homedir() + rawPath.slice(1) : rawPath;
    return expanded === cwd;
  }

  return false;
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
    if (fs.existsSync(path.join(projectRoot, '.claude', 'verify_failed'))) return;
    if (isSessionFocused(cwd)) return;

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
