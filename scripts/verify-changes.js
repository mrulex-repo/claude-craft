#!/usr/bin/env node
/**
 * Stop hook: run verification commands if changes were detected.
 *
 * Reads .claude/changes_pending. If present and git confirms actual changes
 * exist, runs verify.commands from config, writes .claude/changes_detected
 * with results, and clears the pending flag.
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
 * Parse an ISO 8601 duration string into milliseconds.
 * Supports P[n]Y[n]M[n]DT[n]H[n]M[n]S. Returns null if invalid.
 */
function parseIso8601Duration(str) {
  if (typeof str !== 'string') return null;
  const match = str.match(
    /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
  );
  if (!match || str === 'P') return null;
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
    const detectedPath = path.join(projectRoot, '.claude', 'changes_detected');

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

    fs.writeFileSync(
      detectedPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          verified: commands.length > 0,
          allPassed,
          commands: results,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    if (!allPassed) {
      const lines = ['Verification failed. Fix the errors before finishing.\n'];
      for (const r of results) {
        if (!r.passed) {
          lines.push(`Command: ${r.command} (exit ${r.exitCode})`);
          if (r.stdout.trim()) lines.push(r.stdout.trimEnd());
          if (r.stderr.trim()) lines.push(r.stderr.trimEnd());
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
