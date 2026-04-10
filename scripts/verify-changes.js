#!/usr/bin/env node
/**
 * Stop hook: run verification commands if changes were detected.
 *
 * Reads .claude/changes_pending. If present and git confirms actual changes
 * exist, runs verify.commands from config and clears the pending flag.
 * Failures are reported via stderr (exit 2) so Claude can act on them.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');
const { logError } = require('./hook-logger');

let yaml = null;
try {
  yaml = require(path.join(os.homedir(), '.claude-craft', 'node_modules', 'js-yaml'));
} catch {
  // setup.js hasn't run yet; verify will be skipped
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
 * Parse a timeout value into milliseconds.
 *
 * Accepts:
 *   - ISO 8601 duration string: "PT5M", "PT2M30S", "P1DT2H" …
 *   - Plain number (seconds): 360  (set-config.js coerces numeric strings to numbers)
 *   - Numeric string (seconds): "360"
 *
 * Returns null if the value cannot be interpreted.
 */
function parseIso8601Duration(value) {
  // Plain number — treat as seconds (set-config coerces "360" → 360 before YAML storage)
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : null;
  }
  if (typeof value !== 'string') return null;
  // Numeric string — treat as seconds
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const s = Number(value);
    return s > 0 ? Math.round(s * 1000) : null;
  }
  // ISO 8601 duration
  const match = value.match(
    /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
  );
  if (!match || value === 'P') return null;
  const [, years = 0, months = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = match.map(v => Number(v) || 0);
  return Math.round(
    (years * 365.25 * 24 * 3600 +
      months * 30.44 * 24 * 3600 +
      days * 24 * 3600 +
      hours * 3600 +
      minutes * 60 +
      seconds) * 1000
  );
}

function getVerifyConfig(cwd) {
  const userConfig = loadYaml(path.join(os.homedir(), '.claude-craft', 'config.yml'));
  const projectConfig = loadYaml(
    path.join(findProjectRoot(cwd), '.claude', 'claude-craft', 'config.yml')
  );

  const userSection = (userConfig && userConfig['verify']) || {};
  const projectSection = (projectConfig && projectConfig['verify']) || {};
  return { ...userSection, ...projectSection };
}

function hasGitChanges(cwd) {
  try {
    const out = execSync('git status --porcelain', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd,
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
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
    const pendingPath = path.join(projectRoot, '.claude', 'changes_pending');

    if (!fs.existsSync(pendingPath)) return;

    // Always clean up the pending flag
    try { fs.unlinkSync(pendingPath); } catch { /* ok */ }

    // Only proceed if git confirms actual file changes exist
    if (!hasGitChanges(cwd)) return;

    const config = getVerifyConfig(cwd);
    const commands = Array.isArray(config.commands) ? config.commands : [];
    const timeoutMs = parseIso8601Duration(config.timeout) ?? 120000;

    const results = commands.map(cmd => {
      const result = spawnSync(cmd, {
        shell: true,
        cwd,
        encoding: 'utf8',
        timeout: timeoutMs,
      });
      return {
        command: cmd,
        exitCode: result.status ?? 1,
        passed: result.status === 0,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
      };
    });

    const allPassed = results.length === 0 || results.every(r => r.passed);

    if (!allPassed) {
      const ERROR_RE = /\b(error|exception|fail(ed|ure)?|traceback|fatal|panic|cannot|undefined is not|null pointer|segfault|aborted?)\b/i;
      // From the last 100 lines of a stream, return from the first error-like line onward.
      // Returns '' if the stream is empty or no error pattern is found.
      const extractRelevant = (str) => {
        if (!str.trim()) return '';
        const ls = str.trimEnd().split('\n');
        const tail = ls.slice(-100);
        const idx = tail.findIndex(l => ERROR_RE.test(l));
        if (idx === -1) return '';
        const slice = tail.slice(idx);
        const prefix = ls.length > 100 ? `[...truncated, showing from first error in last 100 lines]\n` : '';
        return prefix + slice.join('\n');
      };
      const lines = ['Verification failed. Fix the errors before finishing.\n'];
      for (const r of results) {
        if (!r.passed) {
          lines.push(`Command: ${r.command} (exit ${r.exitCode})`);
          const outRelevant = extractRelevant(r.stdout);
          const errRelevant = extractRelevant(r.stderr);
          if (outRelevant) lines.push(outRelevant);
          if (errRelevant) lines.push(errRelevant);
          // Fallback: no error pattern matched — show last 100 lines of whichever has content
          if (!outRelevant && !errRelevant) {
            const fallback = r.stderr.trim() ? r.stderr : r.stdout;
            if (fallback.trim()) {
              const ls = fallback.trimEnd().split('\n');
              lines.push(ls.length > 100 ? `[...truncated, showing last 100 lines]\n` + ls.slice(-100).join('\n') : fallback.trimEnd());
            }
          }
          lines.push('');
        }
      }
      process.stderr.write(lines.join('\n'));
      process.exit(2);
    }
  } catch (err) {
    logError('verify-changes', err, cwd);
  }
});
