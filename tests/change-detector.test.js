const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  createTempRepo,
  createTempHome,
  writeProjectConfig,
  writeUntracked,
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
  const claudeDir = () => path.join(repoDir, '.claude');
  const pendingPath = () => path.join(claudeDir(), 'changes_pending');
  const statePath = () => path.join(claudeDir(), 'pre_tool_state');

  const payload = (toolName = 'Edit') => ({
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    cwd: repoDir,
  });

  function writePreState(repoDir) {
    const head = execSync('git rev-parse HEAD', { cwd: repoDir, encoding: 'utf8' }).trim();
    const status = execSync('git status --porcelain', { cwd: repoDir, encoding: 'utf8' }).trim();
    const claudeDir = path.join(repoDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'pre_tool_state'), JSON.stringify({ head, status }), 'utf8');
  }

  // --- Config gate ---

  it('does nothing when no verify config is present', () => {
    writePreState(repoDir);
    spawnHook('change-detector.js', payload(), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), false);
  });

  it('does nothing when verify.enabled is false and no commands', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: false\n');
    writePreState(repoDir);
    spawnHook('change-detector.js', payload(), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), false);
  });

  it('does nothing when verify.commands is empty', () => {
    writeProjectConfig(repoDir, 'verify:\n  commands: []\n');
    writePreState(repoDir);
    spawnHook('change-detector.js', payload(), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), false);
  });

  // --- Snapshot comparison ---

  it('creates changes_pending when working tree has new untracked files', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    writePreState(repoDir);
    writeUntracked(repoDir, 'newfile.txt');
    spawnHook('change-detector.js', payload('Bash'), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });

  it('creates changes_pending when HEAD commit changes', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    writePreState(repoDir);
    // Simulate a commit happening during tool execution
    fs.writeFileSync(path.join(repoDir, 'committed.txt'), 'content\n');
    execSync('git add committed.txt', { cwd: repoDir, stdio: 'ignore' });
    execSync('git commit -m "tool commit"', { cwd: repoDir, stdio: 'ignore' });
    spawnHook('change-detector.js', payload('Bash'), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });

  it('does NOT create changes_pending for Bash when nothing changed', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    writePreState(repoDir);
    spawnHook('change-detector.js', payload('Bash'), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), false);
  });

  it('creates changes_pending for Edit when nothing changed in git (file written outside git)', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    writePreState(repoDir);
    // Simulate Edit tool writing a file that was already untracked (no net git status change)
    // But git status does change because the file is now modified
    writeUntracked(repoDir, 'existing.txt');
    spawnHook('change-detector.js', payload('Edit'), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });

  // --- Fallback when no snapshot ---

  it('falls back: creates changes_pending for Edit when no pre_tool_state', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('change-detector.js', payload('Edit'), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });

  it('falls back: creates changes_pending for Write when no pre_tool_state', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('change-detector.js', payload('Write'), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });

  it('falls back: creates changes_pending for NotebookEdit when no pre_tool_state', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('change-detector.js', payload('NotebookEdit'), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });

  it('falls back: does NOT create changes_pending for Bash when no pre_tool_state', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('change-detector.js', payload('Bash'), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), false);
  });

  // --- Snapshot cleanup ---

  it('removes pre_tool_state after running', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    writePreState(repoDir);
    spawnHook('change-detector.js', payload('Bash'), { env: env() });
    assert.equal(fs.existsSync(statePath()), false);
  });

  // --- Gitignore management ---

  it('creates .claude/.gitignore with required entries when verify is enabled', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('change-detector.js', payload(), { env: env() });
    const gitignorePath = path.join(repoDir, '.claude', '.gitignore');
    assert.equal(fs.existsSync(gitignorePath), true);
    const contents = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(contents.includes('changes_pending'));
    assert.ok(contents.includes('pre_tool_state'));
  });

  it('appends missing entries to existing .claude/.gitignore', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    fs.mkdirSync(claudeDir(), { recursive: true });
    fs.writeFileSync(path.join(claudeDir(), '.gitignore'), 'some_other_entry\n', 'utf8');
    spawnHook('change-detector.js', payload(), { env: env() });
    const contents = fs.readFileSync(path.join(claudeDir(), '.gitignore'), 'utf8');
    assert.ok(contents.includes('some_other_entry'));
    assert.ok(contents.includes('changes_pending'));
    assert.ok(contents.includes('pre_tool_state'));
  });

  it('does not duplicate entries in .claude/.gitignore', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    fs.mkdirSync(claudeDir(), { recursive: true });
    fs.writeFileSync(path.join(claudeDir(), '.gitignore'), 'changes_pending\npre_tool_state\n', 'utf8');
    spawnHook('change-detector.js', payload(), { env: env() });
    spawnHook('change-detector.js', payload(), { env: env() });
    const contents = fs.readFileSync(path.join(claudeDir(), '.gitignore'), 'utf8');
    assert.equal(contents.split('changes_pending').length - 1, 1);
    assert.equal(contents.split('pre_tool_state').length - 1, 1);
  });

  // --- Subdirectory ---

  it('creates changes_pending in project root when cwd is a subdirectory', () => {
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    const subDir = path.join(repoDir, 'src');
    fs.mkdirSync(subDir, { recursive: true });
    writePreState(repoDir);
    writeUntracked(repoDir, 'src/newfile.txt');
    spawnHook('change-detector.js', { ...payload('Bash'), cwd: subDir }, { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
    assert.equal(fs.existsSync(path.join(subDir, '.claude', 'changes_pending')), false);
  });

  // --- Config precedence ---

  it('project config overrides user config', () => {
    fs.writeFileSync(
      path.join(fakeHome, '.claude-craft', 'config.yml'),
      'verify:\n  enabled: false\n'
    );
    writeProjectConfig(repoDir, 'verify:\n  enabled: true\n');
    spawnHook('change-detector.js', payload(), { env: env() });
    assert.equal(fs.existsSync(pendingPath()), true);
  });
});
