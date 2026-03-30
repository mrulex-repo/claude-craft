#!/usr/bin/env node
/**
 * Stage files and record commit approval for the current project.
 * Called by /commit-msg after the user approves.
 *
 * Usage:
 *   node approve-commit.js                             # stage everything
 *   node approve-commit.js --except file1 file2 ...   # stage all, then unstage exclusions
 *
 * Stages files, then writes a git write-tree hash to .claude/commit_approved
 * so the commit guard can verify nothing changed between approval and commit.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `${cmd} ${args.join(' ')} failed\n`);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

// Parse --except arguments
const exceptIndex = process.argv.indexOf('--except');
const exclusions = exceptIndex !== -1 ? process.argv.slice(exceptIndex + 1) : [];

// Stage everything
run('git', ['add', '.']);

// Unstage exclusions
for (const file of exclusions) {
  run('git', ['reset', '--', file]);
}

// Snapshot staged tree
const hash = run('git', ['write-tree']);

// Write marker
const markerDir = path.join(process.cwd(), '.claude');
fs.mkdirSync(markerDir, { recursive: true });

const gitignorePath = path.join(markerDir, '.gitignore');
if (!fs.existsSync(gitignorePath)) {
  fs.writeFileSync(gitignorePath, 'commit_approved\n');
}

fs.writeFileSync(path.join(markerDir, 'commit_approved'), hash);
process.stdout.write(`Approved. Staged tree: ${hash}\n`);
