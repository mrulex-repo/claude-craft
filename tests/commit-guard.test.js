const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  createTempRepo,
  createTempHome,
  stageFile,
  getWriteTreeHash,
  cleanup,
} = require('./helpers/git-repo');
const { spawnHook } = require('./helpers/spawn-hook');

describe('commit-guard', () => {
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
  const markerPath = () => path.join(repoDir, '.claude', 'commit_approved');

  const preToolUseCommit = () => ({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "test"' },
    cwd: repoDir,
  });

  it('passes through non-Bash tools', () => {
    const { exitCode } = spawnHook('commit-guard.js', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { command: 'git commit -m "test"' },
      cwd: repoDir,
    }, { env: env() });
    assert.equal(exitCode, 0);
  });

  it('passes through non-commit Bash commands', () => {
    const { exitCode } = spawnHook('commit-guard.js', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
      cwd: repoDir,
    }, { env: env() });
    assert.equal(exitCode, 0);
  });

  it('blocks commit when no marker file exists', () => {
    stageFile(repoDir, 'file.txt');
    const { exitCode, stderr } = spawnHook('commit-guard.js', preToolUseCommit(), { env: env() });
    assert.equal(exitCode, 2);
    assert.match(stderr, /Commit blocked/);
    assert.match(stderr, /\/commit-msg/);
  });

  it('allows commit when marker hash matches staged tree', () => {
    stageFile(repoDir, 'file.txt');
    const hash = getWriteTreeHash(repoDir);
    fs.writeFileSync(markerPath(), hash);

    const { exitCode } = spawnHook('commit-guard.js', preToolUseCommit(), { env: env() });
    assert.equal(exitCode, 0);
  });

  it('blocks commit when marker hash does not match staged tree', () => {
    stageFile(repoDir, 'file.txt');
    fs.writeFileSync(markerPath(), 'deadbeefdeadbeef0000000000000000deadbeef');

    const { exitCode, stderr } = spawnHook('commit-guard.js', preToolUseCommit(), { env: env() });
    assert.equal(exitCode, 2);
    assert.match(stderr, /differ from approved/);
  });

  it('PostToolUse deletes marker file after commit', () => {
    fs.writeFileSync(markerPath(), 'somehash');

    const { exitCode } = spawnHook('commit-guard.js', {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "test"' },
      cwd: repoDir,
    }, { env: env() });
    assert.equal(exitCode, 0);
    assert.equal(fs.existsSync(markerPath()), false);
  });

  it('PostToolUse is silent when marker file is already gone', () => {
    const { exitCode } = spawnHook('commit-guard.js', {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "test"' },
      cwd: repoDir,
    }, { env: env() });
    assert.equal(exitCode, 0);
  });

  it('auto-approval bypasses the guard', () => {
    stageFile(repoDir, 'file.txt');
    fs.writeFileSync(
      path.join(fakeHome, '.claude-craft', 'config.yml'),
      'auto-approval: true\n'
    );

    const { exitCode } = spawnHook('commit-guard.js', preToolUseCommit(), { env: env() });
    assert.equal(exitCode, 0);
  });
});
