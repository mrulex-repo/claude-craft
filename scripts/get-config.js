#!/usr/bin/env node
/**
 * Read a configuration value from ~/.claude-craft/config.yml
 *
 * Usage: node get-config.js <command> <key> <default>
 *
 * Config file format (~/.claude-craft/config.yml):
 *   command-name:
 *     key: value
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

const [, , command, key, defaultValue = ''] = process.argv;

const configPath = path.join(os.homedir(), '.claude-craft', 'config.yml');

function readConfig() {
  if (!fs.existsSync(configPath)) return defaultValue;

  const content = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(content);

  if (!config || typeof config !== 'object') return defaultValue;

  const section = config[command];
  if (!section || typeof section !== 'object') return defaultValue;

  const value = section[key];
  if (value === undefined || value === null) return defaultValue;

  return String(value);
}

try {
  process.stdout.write(readConfig());
} catch {
  process.stdout.write(defaultValue);
}
