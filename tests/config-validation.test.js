const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTempRepo, createTempHome, writeProjectConfig, cleanup } = require('./helpers/git-repo');
const { spawnConfig } = require('./helpers/spawn-hook');

describe('config validation', () => {
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

  const set = (level, command, key, value) =>
    spawnConfig('set-config.js', [level, command, key, value], { env: env(), cwd: repoDir });

  const get = (command, key, defaultVal = '') =>
    spawnConfig('get-config.js', [command, key, defaultVal], { env: env(), cwd: repoDir });

  const validate = () =>
    spawnConfig('validate-config.js', [], { env: env(), cwd: repoDir });

  // --- set-config validation ---

  it('set-config rejects an unknown command', () => {
    const { exitCode, stderr } = set('user', 'typo-command', 'auto-approval', 'true');
    assert.equal(exitCode, 1);
    assert.match(stderr, /Unknown command "typo-command"/);
    assert.match(stderr, /Supported commands:/);
  });

  it('set-config rejects an unknown key for a known command', () => {
    const { exitCode, stderr } = set('user', 'commit-msg', 'typo-key', 'true');
    assert.equal(exitCode, 1);
    assert.match(stderr, /Unknown key "typo-key" for command "commit-msg"/);
    assert.match(stderr, /Supported keys:/);
  });

  it('set-config accepts a valid command and key', () => {
    const { exitCode } = set('user', 'commit-msg', 'auto-approval', 'true');
    assert.equal(exitCode, 0);
  });

  it('set-config accepts verify.enabled', () => {
    const { exitCode } = set('project', 'verify', 'enabled', 'true');
    assert.equal(exitCode, 0);
  });

  it('set-config accepts verify.commands', () => {
    const { exitCode } = set('project', 'verify', 'commands', 'npm test');
    assert.equal(exitCode, 0);
  });

  it('set-config accepts verify.timeout as ISO 8601 duration', () => {
    const { exitCode } = set('project', 'verify', 'timeout', 'PT5M30S');
    assert.equal(exitCode, 0);
  });

  // --- get-config validation ---

  it('get-config rejects an unknown command', () => {
    const { exitCode, stderr } = get('typo-command', 'auto-approval');
    assert.equal(exitCode, 1);
    assert.match(stderr, /Unknown command "typo-command"/);
    assert.match(stderr, /Supported commands:/);
  });

  it('get-config rejects an unknown key for a known command', () => {
    const { exitCode, stderr } = get('commit-msg', 'typo-key');
    assert.equal(exitCode, 1);
    assert.match(stderr, /Unknown key "typo-key" for command "commit-msg"/);
    assert.match(stderr, /Supported keys:/);
  });

  it('get-config returns value normally for valid command and key', () => {
    set('user', 'commit-msg', 'auto-approval', 'true');
    const { exitCode, stdout } = get('commit-msg', 'auto-approval', 'false');
    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), 'true');
  });

  // --- validate-config ---

  it('validate-config reports valid when config is empty', () => {
    const { exitCode, stdout } = validate();
    assert.equal(exitCode, 0);
    assert.match(stdout, /valid/i);
  });

  it('validate-config reports valid for known commands and keys', () => {
    writeProjectConfig(repoDir, 'commit-msg:\n  auto-approval: true\n');
    const { exitCode, stdout } = validate();
    assert.equal(exitCode, 0);
    assert.match(stdout, /valid/i);
  });

  it('validate-config errors on unknown command in project config', () => {
    writeProjectConfig(repoDir, 'typo-command:\n  some-key: value\n');
    const { exitCode, stdout } = validate();
    assert.equal(exitCode, 1);
    assert.match(stdout, /Unknown command "typo-command"/);
    assert.match(stdout, /Supported commands:/);
  });

  it('validate-config errors on unknown key in project config', () => {
    writeProjectConfig(repoDir, 'commit-msg:\n  typo-key: true\n');
    const { exitCode, stdout } = validate();
    assert.equal(exitCode, 1);
    assert.match(stdout, /Unknown key "typo-key" for command "commit-msg"/);
    assert.match(stdout, /Supported keys:/);
  });

  it('validate-config errors on unknown command in user config', () => {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(fakeHome, '.claude-craft', 'config.yml');
    fs.writeFileSync(configPath, 'bad-command:\n  key: value\n');
    const { exitCode, stdout } = validate();
    assert.equal(exitCode, 1);
    assert.match(stdout, /Unknown command "bad-command"/);
  });

  it('validate-config accepts a valid ISO 8601 duration for verify.timeout', () => {
    writeProjectConfig(repoDir, 'verify:\n  timeout: PT5M30S\n');
    const { exitCode, stdout } = validate();
    assert.equal(exitCode, 0);
    assert.match(stdout, /valid/i);
  });

  it('validate-config errors on invalid duration for verify.timeout', () => {
    writeProjectConfig(repoDir, 'verify:\n  timeout: 120\n');
    const { exitCode, stdout } = validate();
    assert.equal(exitCode, 1);
    assert.match(stdout, /Invalid value for "verify\.timeout"/);
    assert.match(stdout, /ISO 8601 duration/);
  });

  it('validate-config errors on malformed duration string for verify.timeout', () => {
    writeProjectConfig(repoDir, 'verify:\n  timeout: "5minutes"\n');
    const { exitCode, stdout } = validate();
    assert.equal(exitCode, 1);
    assert.match(stdout, /Invalid value for "verify\.timeout"/);
  });

  it('validate-config reports multiple errors', () => {
    writeProjectConfig(repoDir, 'bad-cmd:\n  key: v\ncommit-msg:\n  bad-key: true\n');
    const { exitCode, stdout } = validate();
    assert.equal(exitCode, 1);
    assert.match(stdout, /Unknown command "bad-cmd"/);
    assert.match(stdout, /Unknown key "bad-key" for command "commit-msg"/);
  });
});
