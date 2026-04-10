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
  'mcp': {
    'context7.enabled': {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Enable the context7 MCP server (library documentation lookup)',
    },
    'sequential-thinking.enabled': {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Enable the sequential-thinking MCP server (structured reasoning)',
    },
    'github.enabled': {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Enable the GitHub MCP server — requires GITHUB_PERSONAL_ACCESS_TOKEN env var',
    },
  },
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
      type: 'string',
      format: 'duration',
      required: false,
      default: 'PT2M',
      description: 'Timeout for each verification command as an ISO 8601 duration (e.g. PT2M, PT5M30S)',
    },
  },
};

/**
 * Navigate a dotted key path into an object.
 *   getNestedValue({ context7: { enabled: true } }, 'context7.enabled') → true
 *   getNestedValue({ 'auto-approval': false }, 'auto-approval') → false
 */
function getNestedValue(obj, dottedKey) {
  return dottedKey.split('.').reduce((acc, part) => {
    return acc !== null && acc !== undefined && typeof acc === 'object' ? acc[part] : undefined;
  }, obj);
}

/**
 * Write a value at a dotted key path, creating intermediate objects as needed.
 *   setNestedValue(obj, 'context7.enabled', true) → obj.context7.enabled = true
 */
function setNestedValue(obj, dottedKey, value) {
  const parts = dottedKey.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Flatten a nested object to dotted-path keys (one level per nesting).
 * Arrays are treated as leaf values and not traversed.
 *   flattenKeys({ context7: { enabled: true } }) → { 'context7.enabled': true }
 *   flattenKeys({ commands: ['npm test'] })       → { commands: ['npm test'] }
 */
function flattenKeys(obj, prefix) {
  const flat = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(flat, flattenKeys(v, key));
    } else {
      flat[key] = v;
    }
  }
  return flat;
}

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

module.exports = { SCHEMA, isKnownCommand, isKnownKey, getKeySchema, knownCommands, knownKeys, getNestedValue, setNestedValue, flattenKeys };
