const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  createTempRepo,
  createTempHome,
  writeProjectConfig,
  cleanup,
} = require('./helpers/git-repo');
const { spawnHook } = require('./helpers/spawn-hook');

describe('change-detector', () => {
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
  const pendingPath = () => path.join(repoDir, '.claude', 'changes_pending');

  const payload = (toolName = 'Edit') => ({
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    cwd: repoDir,
  });

  it('does nothing when no verify config is present', () => {
    spawnHook('change-detector.js', payload(), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), false);
  });

  it('creates changes_pending when verify.enabled is true', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('change-detector.js', payload(), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });

  it('creates changes_pending when verify.commands is non-empty', () => {
    writeProjectConfig(repoDir, 'verify:\n  commands:\n    - echo ok\n');
    spawnHook('change-detector.js', payload(), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });

  it('does nothing when verify.enabled is false and no commands', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: false\n');
    spawnHook('change-detector.js', payload(), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), false);
  });

  it('does nothing when verify.commands is empty', () => {
    writeProjectConfig(repoDir, 'verify:\n  commands: []\n');
    spawnHook('change-detector.js', payload(), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), false);
  });

  it('triggers for Bash tool use', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('change-detector.js', payload('Bash'), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });

  it('project config overrides user config', () => {
    // User says disabled, project says enabled — project wins
    fs.writeFileSync(
      path.join(fakeHome, '.claude-craft', 'config.yml'),
      'verify:\n  enabled: false\n'
    );
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('change-detector.js', payload(), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });
});
