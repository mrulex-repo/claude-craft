/**
 * Helpers for creating temporary git repositories used in integration tests.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Create a temp directory, init a git repo, make an initial commit,
 * and return the repo path. .claude/ is gitignored so marker files
 * don't pollute git status output.
 */
function createTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-craft-test-'));
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/\n');
  fs.writeFileSync(path.join(dir, '.gitkeep'), '');
  execSync('git add .', { cwd: dir, stdio: 'ignore' });
  execSync('git commit -m "init"', { cwd: dir, stdio: 'ignore' });
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  return dir;
}

/**
 * Create a temp directory to act as HOME for config isolation.
 * Pre-creates the ~/.claude-craft directory.
 */
function createTempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-craft-home-'));
  fs.mkdirSync(path.join(dir, '.claude-craft'), { recursive: true });
  return dir;
}

/**
 * Write and stage a file in the repo.
 */
function stageFile(repoDir, filename, content = 'test content\n') {
  fs.writeFileSync(path.join(repoDir, filename), content);
  execSync(`git add "${filename}"`, { cwd: repoDir, stdio: 'ignore' });
}

/**
 * Return the SHA that `git write-tree` would produce for current staged state.
 */
function getWriteTreeHash(repoDir) {
  return execSync('git write-tree', { cwd: repoDir, encoding: 'utf8' }).trim();
}

/**
 * Write a file without staging it (creates an untracked change visible to git status).
 */
function writeUntracked(repoDir, filename, content = 'change\n') {
  fs.writeFileSync(path.join(repoDir, filename), content);
}

/**
 * Write a project-level claude-craft config.
 */
function writeProjectConfig(repoDir, yaml) {
  const configDir = path.join(repoDir, '.claude', 'claude-craft');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'config.yml'), yaml);
}

/**
 * Recursively remove a temp directory.
 */
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

module.exports = {
  createTempRepo,
  createTempHome,
  stageFile,
  getWriteTreeHash,
  writeUntracked,
  writeProjectConfig,
  cleanup,
};
