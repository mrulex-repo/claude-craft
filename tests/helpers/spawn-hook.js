/**
 * Spawn a hook script with a JSON payload on stdin, return exit code + output.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts');

/**
 * Run a hook script as a child process, piping payload as JSON on stdin.
 * @param {string} scriptName - filename in scripts/
 * @param {object} payload    - hook input (hook_event_name, tool_name, cwd, …)
 * @param {object} opts
 * @param {object} opts.env   - env overrides (merged on top of process.env)
 * @param {string} opts.cwd   - working directory for the child process
 */
function spawnHook(scriptName, payload, { env = {}, cwd } = {}) {
  const result = spawnSync('node', [path.join(SCRIPTS_DIR, scriptName)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 15000,
    cwd,
    env: { ...process.env, ...env },
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Run a config script (get-config / set-config) with CLI args.
 * @param {string}   scriptName - filename in scripts/
 * @param {string[]} args       - argv passed to the script
 * @param {object}   opts
 * @param {object}   opts.env   - env overrides
 * @param {string}   opts.cwd   - working directory (important for project-level config)
 */
function spawnConfig(scriptName, args, { env = {}, cwd = process.cwd() } = {}) {
  const result = spawnSync('node', [path.join(SCRIPTS_DIR, scriptName), ...args], {
    encoding: 'utf8',
    timeout: 5000,
    cwd,
    env: { ...process.env, ...env },
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

module.exports = { spawnHook, spawnConfig, SCRIPTS_DIR };
