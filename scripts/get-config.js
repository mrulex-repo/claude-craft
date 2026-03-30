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
const yaml = require('js-yaml');

const [, , command, key, defaultValue = ''] = process.argv;

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
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
  const userConfig = loadYaml(path.join(os.homedir(), '.claude-craft', 'config.yml'));
  const projectConfig = loadYaml(
    path.join(findProjectRoot(), '.claude', 'claude-craft', 'config.yml')
  );

  const userSection = (userConfig && userConfig[command]) || {};
  const projectSection = (projectConfig && projectConfig[command]) || {};

  const merged = { ...userSection, ...projectSection };

  const value = merged[key];
  if (value === undefined || value === null) return defaultValue;
  return String(value);
}

try {
  process.stdout.write(readConfig());
} catch {
  process.stdout.write(defaultValue);
}
