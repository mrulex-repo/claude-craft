#!/usr/bin/env node
/**
 * Stop hook orchestrator: run verify-changes.js, then notify.js only if
 * verification passed. A single script guarantees sequential execution
 * regardless of how the Claude Code harness schedules multi-hook groups.
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  const scriptDir = __dirname;

  const verify = spawnSync(
    process.execPath,
    [path.join(scriptDir, 'verify-changes.js')],
    { input, encoding: 'utf8', stdio: ['pipe', 'inherit', 'pipe'] }
  );

  if ((verify.status ?? 1) !== 0) {
    if (verify.stderr) process.stderr.write(verify.stderr);
    process.exit(verify.status ?? 1);
    return;
  }

  spawnSync(
    process.execPath,
    [path.join(scriptDir, 'notify.js')],
    { input, encoding: 'utf8', stdio: ['pipe', 'inherit', 'ignore'] }
  );
});
