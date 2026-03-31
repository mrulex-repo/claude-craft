const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTempRepo, createTempHome, cleanup } = require('./helpers/git-repo');
const { spawnConfig } = require('./helpers/spawn-hook');

describe('get-config / set-config', () => {
  let repoDir, fakeHome;

  beforeEach(() => {
    repoDir = createTempRepo();
    fakeHome = createTempHome();
  });

  afterEach(() => {
    cleanup(repoDir);
    cleanup(fakeHome);
  });

  const env = () => ({ HOME: fakeHome });

  const get = (command, key, defaultVal = '') =>
    spawnConfig('get-config.js', [command, key, defaultVal], { env: env(), cwd: repoDir });

  const set = (level, command, key, value) =>
    spawnConfig('set-config.js', [level, command, key, value], { env: env(), cwd: repoDir });

  it('returns the default value when no config exists', () => {
    const { stdout } = get('verify', 'enabled', 'false');
    assert.equal(stdout.trim(), 'false');
  });

  it('set then get round-trips a value at user level', () => {
    set('user', 'verify', 'enabled', 'true');
    const { stdout } = get('verify', 'enabled', 'false');
    assert.equal(stdout.trim(), 'true');
  });

  it('set then get round-trips a value at project level', () => {
    set('project', 'verify', 'enabled', 'true');
    const { stdout } = get('verify', 'enabled', 'false');
    assert.equal(stdout.trim(), 'true');
  });

  it('project level overrides user level', () => {
    set('user', 'verify', 'enabled', 'false');
    set('project', 'verify', 'enabled', 'true');
    const { stdout } = get('verify', 'enabled', 'false');
    assert.equal(stdout.trim(), 'true');
  });

  it('preserves other keys when setting a new key', () => {
    set('project', 'verify', 'enabled', 'true');
    set('project', 'verify', 'timeout', '60');
    assert.equal(get('verify', 'enabled', '').stdout.trim(), 'true');
    assert.equal(get('verify', 'timeout', '').stdout.trim(), '60');
  });

  it('coerces numeric string values to numbers', () => {
    set('project', 'verify', 'timeout', '120');
    const configPath = path.join(repoDir, '.claude', 'claude-craft', 'config.yml');
    const raw = fs.readFileSync(configPath, 'utf8');
    // Should be stored as a number (120), not a quoted string ("120")
    assert.match(raw, /timeout: 120/);
  });

  it('set-config exits with error on missing arguments', () => {
    const { exitCode } = spawnConfig('set-config.js', ['user', 'verify'], { env: env(), cwd: repoDir });
    assert.equal(exitCode, 1);
  });
});
