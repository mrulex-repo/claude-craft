const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  createTempRepo,
  createTempHome,
  writeUntracked,
  writeProjectConfig,
  cleanup,
} = require('./helpers/git-repo');
const { spawnHook } = require('./helpers/spawn-hook');

describe('verify-changes', () => {
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
  const detectedPath = () => path.join(repoDir, '.claude', 'changes_detected');

  const run = (cwd = repoDir) => spawnHook('verify-changes.js', { cwd }, { env: env() });

  it('does nothing when changes_pending does not exist', () => {
    run();
    assert.equal(fs.existsSync(detectedPath()), false);
  });

  it('cleans up pending but skips detection when git has no changes', () => {
    // Fresh repo after init commit has no changes (and .claude/ is gitignored)
    fs.writeFileSync(pendingPath(), '');
    run();
    assert.equal(fs.existsSync(pendingPath()), false);
    assert.equal(fs.existsSync(detectedPath()), false);
  });

  it('writes changes_detected with no commands when config has none', () => {
    fs.writeFileSync(pendingPath(), '');
    writeUntracked(repoDir, 'modified.txt');

    run();

    assert.equal(fs.existsSync(pendingPath()), false);
    const result = JSON.parse(fs.readFileSync(detectedPath(), 'utf8'));
    assert.equal(result.verified, false);
    assert.equal(result.allPassed, true);
    assert.deepEqual(result.commands, []);
    assert.ok(result.timestamp);
  });

  it('writes changes_detected with allPassed true when all commands pass', () => {
    fs.writeFileSync(pendingPath(), '');
    writeUntracked(repoDir, 'modified.txt');
    writeProjectConfig(repoDir, 'verify:\n  commands:\n    - "true"\n    - "true"\n');

    run();

    const result = JSON.parse(fs.readFileSync(detectedPath(), 'utf8'));
    assert.equal(result.verified, true);
    assert.equal(result.allPassed, true);
    assert.equal(result.commands.length, 2);
    assert.ok(result.commands.every(c => c.passed));
  });

  it('writes changes_detected with allPassed false when a command fails', () => {
    fs.writeFileSync(pendingPath(), '');
    writeUntracked(repoDir, 'modified.txt');
    writeProjectConfig(repoDir, 'verify:\n  commands:\n    - "true"\n    - "false"\n');

    run();

    const result = JSON.parse(fs.readFileSync(detectedPath(), 'utf8'));
    assert.equal(result.verified, true);
    assert.equal(result.allPassed, false);
    assert.equal(result.commands[0].passed, true);
    assert.equal(result.commands[1].passed, false);
  });

  it('records per-command exit codes', () => {
    fs.writeFileSync(pendingPath(), '');
    writeUntracked(repoDir, 'modified.txt');
    writeProjectConfig(repoDir, 'verify:\n  commands:\n    - "false"\n');

    run();

    const result = JSON.parse(fs.readFileSync(detectedPath(), 'utf8'));
    assert.equal(result.commands[0].exitCode, 1);
    assert.equal(result.commands[0].command, 'false');
  });

  it('reads and writes state files in project root when cwd is a subdirectory', () => {
    fs.writeFileSync(pendingPath(), '');
    writeUntracked(repoDir, 'modified.txt');
    const subDir = path.join(repoDir, 'src');
    fs.mkdirSync(subDir, { recursive: true });

    run(subDir);

    assert.equal(fs.existsSync(pendingPath()), false);
    assert.equal(fs.existsSync(detectedPath()), true);
    // Must NOT create stray state files in the subdirectory
    assert.equal(fs.existsSync(path.join(subDir, '.claude', 'changes_pending')), false);
    assert.equal(fs.existsSync(path.join(subDir, '.claude', 'changes_detected')), false);
  });

  it('uses timeout from config and kills commands that exceed it', () => {
    fs.writeFileSync(pendingPath(), '');
    writeUntracked(repoDir, 'modified.txt');
    // PT0.1S = 100ms timeout; sleep 5 will be killed
    writeProjectConfig(repoDir, 'verify:\n  timeout: PT0.1S\n  commands:\n    - "sleep 5"\n');

    run();

    const result = JSON.parse(fs.readFileSync(detectedPath(), 'utf8'));
    assert.equal(result.verified, true);
    assert.equal(result.allPassed, false);
    assert.equal(result.commands[0].command, 'sleep 5');
    assert.equal(result.commands[0].passed, false);
  });

  it('always cleans up changes_pending even when verification fails', () => {
    fs.writeFileSync(pendingPath(), '');
    writeUntracked(repoDir, 'modified.txt');
    writeProjectConfig(repoDir, 'verify:\n  commands:\n    - "false"\n');

    run();

    assert.equal(fs.existsSync(pendingPath()), false);
  });
});
