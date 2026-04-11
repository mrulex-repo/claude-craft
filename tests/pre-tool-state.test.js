const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  createTempRepo,
  createTempHome,
  writeProjectConfig,
  cleanup,
} = require('./helpers/git-repo');
const { spawnHook } = require('./helpers/spawn-hook');

describe('pre-tool-state', () => {
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
  const statePath = () => path.join(repoDir, '.claude', 'pre_tool_state');

  const payload = (toolName = 'Edit') => ({
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    cwd: repoDir,
  });

  it('does nothing when no verify config is present', () => {
    spawnHook('pre-tool-state.js', payload(), { env: env() });
    assert.equal(fs.existsSync(statePath()), false);
  });

  it('does nothing when verify.enabled is false', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: false\n');
    spawnHook('pre-tool-state.js', payload(), { env: env() });
    assert.equal(fs.existsSync(statePath()), false);
  });

  it('writes pre_tool_state when verify.enabled is true', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('pre-tool-state.js', payload(), { env: env() });
    assert.equal(fs.existsSync(statePath()), true);
  });

  it('writes pre_tool_state when verify.commands is non-empty', () => {
    writeProjectConfig(repoDir, 'verify:\n  commands:\n    - echo ok\n');
    spawnHook('pre-tool-state.js', payload(), { env: env() });
    assert.equal(fs.existsSync(statePath()), true);
  });

  it('captures current HEAD commit hash', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    const expectedHead = execSync('git rev-parse HEAD', { cwd: repoDir, encoding: 'utf8' }).trim();
    spawnHook('pre-tool-state.js', payload(), { env: env() });
    const state = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    assert.equal(state.head, expectedHead);
  });

  it('captures current git status', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    // Write an untracked file so status is non-empty
    fs.writeFileSync(path.join(repoDir, 'dirty.txt'), 'change\n');
    const expectedStatus = execSync('git status --porcelain', { cwd: repoDir, encoding: 'utf8' }).trim();
    spawnHook('pre-tool-state.js', payload(), { env: env() });
    const state = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    assert.equal(state.status, expectedStatus);
  });

  it('captures empty status for a clean repo', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('pre-tool-state.js', payload(), { env: env() });
    const state = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    assert.equal(state.status, '');
  });

  it('works for Bash tool', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('pre-tool-state.js', payload('Bash'), { env: env() });
    assert.equal(fs.existsSync(statePath()), true);
  });

  it('writes state in project root when cwd is a subdirectory', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    const subDir = path.join(repoDir, 'src');
    fs.mkdirSync(subDir, { recursive: true });
    spawnHook('pre-tool-state.js', { ...payload(), cwd: subDir }, { env: env() });
    assert.equal(fs.existsSync(statePath()), true);
    assert.equal(fs.existsSync(path.join(subDir, '.claude', 'pre_tool_state')), false);
  });
});
