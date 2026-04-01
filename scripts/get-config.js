#!/usr/bin/env node
/**
 * Read a configuration value with two-level override:
 *   1. User level:    ~/.claude-craft/config.yml
 *   2. Project level: <git-root>/.claude/claude-craft/config.yml
 *
 * Project-level values override user-level values.
 *
 * Usage: node get-config.js <command> <key> <default>
 *
 * Config file format:
 *   command-name:
 *     key: value
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { isKnownCommand, isKnownKey, getKeySchema, knownCommands, knownKeys, getNestedValue } = require('./config-schema');

let yaml = null;
try {
  yaml = require(path.join(os.homedir(), '.claude-craft', 'node_modules', 'js-yaml'));
} catch {
  // setup.js hasn't run yet; config reads will fall through to defaults
}

const [, , command, key, defaultValue = ''] = process.argv;

function loadYaml(filePath) {
  if (!yaml || !fs.existsSync(filePath)) return null;
  try {
    const config = yaml.load(fs.readFileSync(filePath, 'utf8'));
    return config && typeof config === 'object' ? config : null;
  } catch {
    return null;
  }
}

function findProjectRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function readConfig() {
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

  const userConfig = loadYaml(path.join(os.homedir(), '.claude-craft', 'config.yml'));
  const projectConfig = loadYaml(
    path.join(findProjectRoot(), '.claude', 'claude-craft', 'config.yml')
  );

  const userSection = (userConfig && userConfig[command]) || {};
  const projectSection = (projectConfig && projectConfig[command]) || {};

  const merged = { ...userSection, ...projectSection };

  const value = getNestedValue(merged, key);
  if (value !== undefined && value !== null) return String(value);

  const keySchema = getKeySchema(command, key);

  if (keySchema.required) {
    if (keySchema.default === undefined) {
      process.stderr.write(
        `ERROR: Required key "${command}.${key}" is not set and has no default value.\n` +
        `       ${keySchema.description}\n`
      );
      process.exit(1);
    }
    process.stderr.write(
      `INFO: "${command}.${key}" is not set, using default: ${JSON.stringify(keySchema.default)}\n`
    );
    return String(keySchema.default);
  }

  return defaultValue !== '' ? defaultValue
    : keySchema.default !== undefined ? String(keySchema.default)
    : '';
}

try {
  process.stdout.write(readConfig());
} catch (err) {
  if (err.code === undefined) throw err; // re-throw process.exit signals handled above
  process.stdout.write(defaultValue);
}
