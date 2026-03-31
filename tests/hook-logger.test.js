const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logError } = require('../scripts/hook-logger');
const { cleanup } = require('./helpers/git-repo');

describe('hook-logger', () => {
  let tempDir, logPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-craft-logger-test-'));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    logPath = path.join(tempDir, '.claude', 'hooks_error.log');
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it('creates the log file and writes a structured entry', () => {
    logError('test-script', new Error('something broke'), tempDir);
    assert.ok(fs.existsSync(logPath));
    const content = fs.readFileSync(logPath, 'utf8');
    assert.match(content, /\[test-script\]/);
    assert.match(content, /something broke/);
    assert.match(content, /---/);
  });

  it('includes a UTC timestamp in the entry', () => {
    logError('ts-test', new Error('err'), tempDir);
    const content = fs.readFileSync(logPath, 'utf8');
    assert.match(content, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('includes the stack trace when available', () => {
    logError('stack-test', new Error('with stack'), tempDir);
    const content = fs.readFileSync(logPath, 'utf8');
    assert.match(content, /hook-logger\.test\.js/);
  });

  it('handles non-Error values gracefully', () => {
    logError('type-test', 'a plain string error', tempDir);
    const content = fs.readFileSync(logPath, 'utf8');
    assert.match(content, /a plain string error/);
  });

  it('appends multiple entries separated by the delimiter', () => {
    logError('s1', new Error('first'), tempDir);
    logError('s2', new Error('second'), tempDir);
    const content = fs.readFileSync(logPath, 'utf8');
    assert.match(content, /first/);
    assert.match(content, /second/);
    const entries = content.split('---\n').filter(e => e.trim());
    assert.equal(entries.length, 2);
  });

  it('caps the log at 50 entries, dropping the oldest', () => {
    for (let i = 0; i < 55; i++) {
      logError('cap-test', new Error(`error ${i}`), tempDir);
    }
    const content = fs.readFileSync(logPath, 'utf8');
    const entries = content.split('---\n').filter(e => e.trim());
    assert.equal(entries.length, 50);
    // Oldest entries (0–4) should be gone, newest (5–54) should remain
    assert.ok(!content.includes('error 0'));
    assert.ok(content.includes('error 54'));
  });

  it('does not throw when cwd does not exist', () => {
    assert.doesNotThrow(() => {
      logError('bad-cwd', new Error('test'), '/nonexistent/path/that/does/not/exist');
    });
  });
});
