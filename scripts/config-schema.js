#!/usr/bin/env node
/**
 * Central configuration schema for claude-craft.
 *
 * When adding a new command, register its configurable keys here.
 * This schema is the single source of truth for:
 *   - which commands and keys are valid (typo detection)
 *   - default values
 *   - whether a key is required
 *   - human-readable descriptions (shown in /config)
 *
 * Key entry shape:
 *   type        - 'boolean' | 'string' | 'number' | 'array'
 *   required    - if true, the key must be set or have a default
 *   default     - fallback value; undefined means no default (required must be explicit)
 *   description - shown in the /config options table
 */
'use strict';

const SCHEMA = {
  'commit-msg': {
    'auto-approval': {
      type: 'boolean',
      required: false,
      default: false,
      description: 'When false (default), Claude presents the commit message and waits for your approval before committing. Set to true to skip the approval gate and commit immediately.',
    },
  },
  'verify': {
    'enabled': {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Explicitly enable verification even without commands',
    },
    'commands': {
      type: 'array',
      required: false,
      default: [],
      description: 'Shell commands to run after changes are detected',
    },
    'timeout': {
      type: 'number',
      required: false,
      default: 120,
      description: 'Timeout in seconds for each verification command',
    },
  },
};

function isKnownCommand(command) {
  return Object.prototype.hasOwnProperty.call(SCHEMA, command);
}

function isKnownKey(command, key) {
  return isKnownCommand(command) &&
    Object.prototype.hasOwnProperty.call(SCHEMA[command], key);
}

function getKeySchema(command, key) {
  if (!isKnownKey(command, key)) return null;
  return SCHEMA[command][key];
}

function knownCommands() {
  return Object.keys(SCHEMA);
}

function knownKeys(command) {
  if (!isKnownCommand(command)) return [];
  return Object.keys(SCHEMA[command]);
}

module.exports = { SCHEMA, isKnownCommand, isKnownKey, getKeySchema, knownCommands, knownKeys };
