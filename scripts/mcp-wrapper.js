#!/usr/bin/env node
/**
 * MCP wrapper: reads claude-craft config to decide whether to start the real
 * MCP server or run a disabled stub that advertises no tools.
 *
 * Usage: node mcp-wrapper.js <mcp-name> <command> [args...]
 *   mcp-name  - matches the key under `mcp:` in config (e.g. "context7")
 *   command   - the real MCP command to exec when enabled (e.g. "npx")
 *   args      - arguments forwarded to the real command
 *
 * Config (mcp.<name>.enabled):
 *   true  → spawn the real MCP and proxy stdio
 *   false → run a stub that responds with empty capabilities (default for all servers)
 *
 * js-yaml is loaded from ~/.claude-craft/node_modules/ (deployed by setup.js).
 * On the very first session before setup has run, yaml loading is skipped and
 * the MCP defaults to disabled.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const [, , mcpName, ...realCmd] = process.argv;

if (!mcpName || realCmd.length === 0) {
  process.stderr.write('Usage: mcp-wrapper.js <mcp-name> <command> [args...]\n');
  process.exit(1);
}

// ── Config loading ────────────────────────────────────────────────────────────

const HOME_CRAFT = path.join(os.homedir(), '.claude-craft');

let yaml = null;
try {
  yaml = require(path.join(HOME_CRAFT, 'node_modules', 'js-yaml'));
} catch {
  // setup.js hasn't run yet (first session); fall through to default
}

function loadYaml(filePath) {
  if (!yaml || !fs.existsSync(filePath)) return null;
  try {
    const parsed = yaml.load(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function findProjectRoot() {
  const { execFileSync } = require('child_process');
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function isEnabled() {
  // yaml unavailable means setup hasn't run yet — default to disabled
  if (!yaml) return false;

  const userConfig = loadYaml(path.join(HOME_CRAFT, 'config.yml'));
  const projectConfig = loadYaml(
    path.join(findProjectRoot(), '.claude', 'claude-craft', 'config.yml')
  );

  const userVal = userConfig && userConfig.mcp && userConfig.mcp[mcpName];
  const projectVal = projectConfig && projectConfig.mcp && projectConfig.mcp[mcpName];

  // Project overrides user; both fall back to schema default
  const merged = Object.assign({}, userVal || {}, projectVal || {});
  return merged.enabled === true; // default false
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (isEnabled()) {
  const [cmd, ...args] = realCmd;
  const child = spawn(cmd, args, { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  runStub();
}

// ── Disabled stub ─────────────────────────────────────────────────────────────

function runStub() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line.trim()); } catch { return; }
    if (!msg || !msg.id) return; // notifications — no response needed

    let result;
    switch (msg.method) {
      case 'initialize':
        result = {
          protocolVersion: (msg.params && msg.params.protocolVersion) || '2024-11-05',
          capabilities: {},
          serverInfo: { name: `ccraft-${mcpName}-disabled`, version: '0.0.0' },
        };
        break;
      case 'tools/list':
        result = { tools: [] };
        break;
      case 'resources/list':
        result = { resources: [] };
        break;
      case 'prompts/list':
        result = { prompts: [] };
        break;
      default:
        process.stdout.write(
          JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } }) + '\n'
        );
        return;
    }

    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
  });
}
