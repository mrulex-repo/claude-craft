#!/usr/bin/env node
/**
 * Validate claude-craft configuration files against the schema.
 *
 * Checks both user-level and project-level config files for:
 *   - Unknown commands (likely typos)
 *   - Unknown keys within a command (likely typos)
 *   - Required keys with no default that are missing → ERROR
 *   - Required keys with a default that are missing → INFO (default will be used)
 *
 * Usage: node validate-config.js
 *
 * Exit codes:
 *   0 - valid (infos may still be printed)
 *   1 - one or more errors found
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { SCHEMA, isKnownCommand, isKnownKey, knownCommands, knownKeys, getNestedValue, flattenKeys } = require('./config-schema');

let yaml = null;
try {
  yaml = require(path.join(os.homedir(), '.claude-craft', 'node_modules', 'js-yaml'));
} catch {
  // setup.js hasn't run yet
}

function loadYaml(filePath) {
  if (!yaml || !fs.existsSync(filePath)) return null;
  try {
    const config = yaml.load(fs.readFileSync(filePath, 'utf8'));
    return config && typeof config === 'object' ? config : null;
  } catch (err) {
    process.stdout.write(`ERROR: Could not parse ${filePath}: ${err.message}\n`);
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

function validateFile(config, filePath) {
  const errors = [];
  const infos = [];

  for (const command of Object.keys(config)) {
    if (!isKnownCommand(command)) {
      errors.push(
        `ERROR: Unknown command "${command}" in ${filePath}.\n` +
        `       Supported commands: ${knownCommands().join(', ')}`
      );
      continue;
    }

    const section = config[command];
    if (!section || typeof section !== 'object') continue;

    for (const key of Object.keys(flattenKeys(section))) {
      if (!isKnownKey(command, key)) {
        errors.push(
          `ERROR: Unknown key "${key}" for command "${command}" in ${filePath}.\n` +
          `       Supported keys: ${knownKeys(command).join(', ')}`
        );
      }
    }
  }

  return { errors, infos };
}

function validateRequired(merged) {
  const errors = [];
  const infos = [];

  for (const command of knownCommands()) {
    const section = (merged[command] && typeof merged[command] === 'object')
      ? merged[command]
      : {};

    for (const key of knownKeys(command)) {
      const keySchema = SCHEMA[command][key];
      if (!keySchema.required) continue;

      const value = getNestedValue(section, key);
      if (value !== undefined && value !== null) continue;

      if (keySchema.default === undefined) {
        errors.push(
          `ERROR: Required key "${command}.${key}" is not set and has no default value.\n` +
          `       ${keySchema.description}`
        );
      } else {
        infos.push(
          `INFO: "${command}.${key}" is not set, using default: ${JSON.stringify(keySchema.default)}\n` +
          `      ${keySchema.description}`
        );
      }
    }
  }

  return { errors, infos };
}

function run() {
  if (!yaml) {
    process.stdout.write('Configuration validation skipped: setup not yet complete. Restart your session.\n');
    process.exit(0);
  }

  const userConfigPath = path.join(os.homedir(), '.claude-craft', 'config.yml');
  const projectConfigPath = path.join(
    findProjectRoot(),
    '.claude', 'claude-craft', 'config.yml'
  );

  const userConfig = loadYaml(userConfigPath);
  const projectConfig = loadYaml(projectConfigPath);

  const allErrors = [];
  const allInfos = [];

  if (userConfig) {
    const { errors, infos } = validateFile(userConfig, userConfigPath);
    allErrors.push(...errors);
    allInfos.push(...infos);
  }

  if (projectConfig) {
    const { errors, infos } = validateFile(projectConfig, projectConfigPath);
    allErrors.push(...errors);
    allInfos.push(...infos);
  }

  const merged = {};
  for (const cmd of knownCommands()) {
    const userSection = (userConfig && userConfig[cmd]) || {};
    const projectSection = (projectConfig && projectConfig[cmd]) || {};
    merged[cmd] = { ...userSection, ...projectSection };
  }

  const { errors: reqErrors, infos: reqInfos } = validateRequired(merged);
  allErrors.push(...reqErrors);
  allInfos.push(...reqInfos);

  if (allErrors.length === 0 && allInfos.length === 0) {
    process.stdout.write('Configuration is valid.\n');
    process.exit(0);
  }

  for (const msg of allErrors) {
    process.stdout.write(msg + '\n');
  }
  for (const msg of allInfos) {
    process.stdout.write(msg + '\n');
  }

  if (allErrors.length > 0) {
    process.exit(1);
  }
}

run();
