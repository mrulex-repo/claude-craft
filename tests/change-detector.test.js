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

  it('creates .claude/.gitignore with required entries when verify is enabled', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('change-detector.js', payload(), { env: env() });
    const gitignorePath = path.join(repoDir, '.claude', '.gitignore');
    assert.equal(fs.existsSync(gitignorePath), true);
    const contents = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(contents.includes('changes_pending'));
    assert.ok(contents.includes('changes_detected'));
  });

  it('appends missing entries to existing .claude/.gitignore', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    const claudeDir = path.join(repoDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, '.gitignore'), 'some_other_entry\n', 'utf8');
    spawnHook('change-detector.js', payload(), { env: env() });
    const contents = fs.readFileSync(path.join(claudeDir, '.gitignore'), 'utf8');
    assert.ok(contents.includes('some_other_entry'));
    assert.ok(contents.includes('changes_pending'));
    assert.ok(contents.includes('changes_detected'));
  });

  it('does not duplicate entries in .claude/.gitignore', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    const claudeDir = path.join(repoDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, '.gitignore'), 'changes_pending\nchanges_detected\n', 'utf8');
    spawnHook('change-detector.js', payload(), { env: env() });
    spawnHook('change-detector.js', payload(), { env: env() });
    const contents = fs.readFileSync(path.join(claudeDir, '.gitignore'), 'utf8');
    assert.equal(contents.split('changes_pending').length - 1, 1);
    assert.equal(contents.split('changes_detected').length - 1, 1);
  });

  it('creates changes_pending in project root when cwd is a subdirectory', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    const subDir = path.join(repoDir, 'src');
    fs.mkdirSync(subDir, { recursive: true });
    spawnHook('change-detector.js', { ...payload(), cwd: subDir }, { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
    // Must NOT create a stray .claude folder in the subdirectory
    assert.equal(fs.existsSync(path.join(subDir, '.claude', 'changes_pending')), false);
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
