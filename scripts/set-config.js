#!/usr/bin/env node
/**
 * Set a configuration value at user or project level.
 *
 * Usage: node set-config.js <level> <command> <key> <value>
 *   level:   user    → ~/.claude-craft/config.yml
 *            project → <git-root>/.claude/claude-craft/config.yml
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const yaml = require('js-yaml');
const { isKnownCommand, isKnownKey, knownCommands, knownKeys } = require('./config-schema');

const [, , level, command, key, value] = process.argv;

if (!level || !command || !key || value === undefined) {
  process.stderr.write('Usage: set-config.js <level> <command> <key> <value>\n');
  process.exit(1);
}

if (!isKnownCommand(command)) {
  process.stderr.write(
    `ERROR: Unknown command "${command}".\n` +
    `       Supported commands: ${knownCommands().join(', ')}\n`
  );
  process.exit(1);
}

if (!isKnownKey(command, key)) {
  process.stderr.write(
    `ERROR: Unknown key "${key}" for command "${command}".\n` +
    `       Supported keys: ${knownKeys(command).join(', ')}\n`
  );
  process.exit(1);
}

function getConfigPath(lvl) {
  if (lvl === 'user') {
    return path.join(os.homedir(), '.claude-craft', 'config.yml');
  }
  if (lvl === 'project') {
    let root;
    try {
      root = execSync('git rev-parse --show-toplevel', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      root = process.cwd();
    }
    return path.join(root, '.claude', 'claude-craft', 'config.yml');
  }
  process.stderr.write(`Unknown level: "${lvl}". Use "user" or "project".\n`);
  process.exit(1);
}

const configPath = getConfigPath(level);

fs.mkdirSync(path.dirname(configPath), { recursive: true });

let config = {};
if (fs.existsSync(configPath)) {
  try {
    const loaded = yaml.load(fs.readFileSync(configPath, 'utf8'));
    if (loaded && typeof loaded === 'object') config = loaded;
  } catch {}
}

if (!config[command] || typeof config[command] !== 'object') {
  config[command] = {};
}

// Coerce to native type
let parsed = value;
if (value === 'true') parsed = true;
else if (value === 'false') parsed = false;
else if (value !== '' && !isNaN(value)) parsed = Number(value);

config[command][key] = parsed;

fs.writeFileSync(configPath, yaml.dump(config), 'utf8');
process.stdout.write(`[${level}] ${command}.${key} = ${value}\n`);
