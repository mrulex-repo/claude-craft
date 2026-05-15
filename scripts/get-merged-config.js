#!/usr/bin/env node
/**
 * Output the effective configuration by merging user and project levels.
 * Project-level values override user-level values (per command section).
 * Outputs YAML, or "(empty)" if no config is set at either level.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

let yaml = null;
try {
  yaml = require(path.join(os.homedir(), '.claude-craft', 'node_modules', 'js-yaml'));
} catch {
  process.stdout.write('(setup not yet complete)\n');
  process.exit(0);
}

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = yaml.load(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
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

const userConfig = loadYaml(path.join(os.homedir(), '.claude-craft', 'config.yml')) || {};
const projectConfig = loadYaml(
  path.join(findProjectRoot(), '.claude', 'claude-craft', 'config.yml')
) || {};

const commands = new Set([...Object.keys(userConfig), ...Object.keys(projectConfig)]);

if (commands.size === 0) {
  process.stdout.write('(empty)\n');
  process.exit(0);
}

const merged = {};
for (const cmd of commands) {
  merged[cmd] = { ...(userConfig[cmd] || {}), ...(projectConfig[cmd] || {}) };
}

process.stdout.write(yaml.dump(merged));
