const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const { spawnHook } = require('./helpers/spawn-hook');

const home = os.homedir();

const preToolUse = (tool_name, tool_input) => ({
  hook_event_name: 'PreToolUse',
  tool_name,
  tool_input,
  cwd: process.cwd(),
});

describe('config-guard', () => {
  // ── Pass-through cases ──────────────────────────────────────────────────────

  it('passes through unrelated Bash commands', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: 'echo hello',
    }));
    assert.equal(exitCode, 0);
  });

  it('passes through unrelated Edit tool', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Edit', {
      file_path: '/some/project/src/main.js',
    }));
    assert.equal(exitCode, 0);
  });

  it('passes through unrelated Write tool', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Write', {
      file_path: '/tmp/output.txt',
    }));
    assert.equal(exitCode, 0);
  });

  it('passes through read-only Bash commands touching config paths', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: `cat ${path.join(home, '.claude-craft', 'config.yml')}`,
    }));
    assert.equal(exitCode, 0);
  });

  // ── Edit / Write tool blocks ────────────────────────────────────────────────

  it('blocks Edit on user-level config.yml', () => {
    const { exitCode, stderr } = spawnHook('config-guard.js', preToolUse('Edit', {
      file_path: path.join(home, '.claude-craft', 'config.yml'),
    }));
    assert.equal(exitCode, 2);
    assert.match(stderr, /Config write blocked/);
  });

  it('blocks Write on user-level config.yml', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Write', {
      file_path: path.join(home, '.claude-craft', 'config.yml'),
    }));
    assert.equal(exitCode, 2);
  });

  it('blocks Edit on ~/.claude/settings.json', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Edit', {
      file_path: path.join(home, '.claude', 'settings.json'),
    }));
    assert.equal(exitCode, 2);
  });

  it('blocks Edit on ~/.claude/settings.local.json', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Edit', {
      file_path: path.join(home, '.claude', 'settings.local.json'),
    }));
    assert.equal(exitCode, 2);
  });

  it('blocks Edit on project-level claude-craft config', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Edit', {
      file_path: '/home/user/myproject/.claude/claude-craft/config.yml',
    }));
    assert.equal(exitCode, 2);
  });

  it('blocks Edit on tilde-prefixed config path', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Edit', {
      file_path: '~/.claude-craft/config.yml',
    }));
    assert.equal(exitCode, 2);
  });

  // ── Bash write blocks ───────────────────────────────────────────────────────

  it('blocks redirect write to user config.yml', () => {
    const configPath = path.join(home, '.claude-craft', 'config.yml');
    const { exitCode, stderr } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: `echo "key: value" > ${configPath}`,
    }));
    assert.equal(exitCode, 2);
    assert.match(stderr, /Config write blocked/);
  });

  it('blocks redirect write using tilde path', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: 'echo "key: value" > ~/.claude-craft/config.yml',
    }));
    assert.equal(exitCode, 2);
  });

  it('blocks sed -i on config.yml', () => {
    const configPath = path.join(home, '.claude-craft', 'config.yml');
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: `sed -i 's/false/true/' ${configPath}`,
    }));
    assert.equal(exitCode, 2);
  });

  it('blocks tee to config.yml', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: 'echo "key: value" | tee ~/.claude-craft/config.yml',
    }));
    assert.equal(exitCode, 2);
  });

  it('blocks cp to config.yml', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: 'cp /tmp/newconfig.yml ~/.claude-craft/config.yml',
    }));
    assert.equal(exitCode, 2);
  });

  it('blocks mv to config.yml', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: 'mv /tmp/newconfig.yml ~/.claude-craft/config.yml',
    }));
    assert.equal(exitCode, 2);
  });

  it('blocks redirect write to settings.json', () => {
    const settingsPath = path.join(home, '.claude', 'settings.json');
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: `echo '{}' > ${settingsPath}`,
    }));
    assert.equal(exitCode, 2);
  });

  // ── Allowed script invocations ──────────────────────────────────────────────

  it('allows node set-config.js invocation', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: `node ${path.join(home, '.claude-craft', 'set-config.js')} user commit-msg auto-approval true`,
    }));
    assert.equal(exitCode, 0);
  });

  it('allows node setup.js invocation', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: `node ${path.join(home, '.claude-craft', 'setup.js')}`,
    }));
    assert.equal(exitCode, 0);
  });

  it('blocks inline node -e write even if it calls set-config.js in the string', () => {
    const { exitCode } = spawnHook('config-guard.js', preToolUse('Bash', {
      command: `node -e "require('fs').writeFileSync('${path.join(home, '.claude-craft', 'config.yml')}', 'key: val')"`,
    }));
    assert.equal(exitCode, 2);
  });
});
