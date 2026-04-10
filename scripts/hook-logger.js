#!/usr/bin/env node
/**
 * Shared error logger for hook scripts.
 *
 * Writes full details to .claude/hooks_error.log (persistent, capped at 50 entries)
 * and a short one-line notice to stderr so Claude can inform the user.
 * Double-wrapped so a logging failure can never crash the calling hook.
 */
const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 50;
const DELIMITER = '---\n';

function logError(scriptName, err, cwd) {
  try {
    const timestamp = new Date().toISOString();
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : '';
    const entry = `[${timestamp}] [${scriptName}] ${message}\n${stack ? stack + '\n' : ''}`;

    try {
      const dir = path.join(cwd || process.cwd(), '.claude');
      const logPath = path.join(dir, 'hooks_error.log');

      fs.mkdirSync(dir, { recursive: true });

      let existing = '';
      try { existing = fs.readFileSync(logPath, 'utf8'); } catch { /* new file */ }

      const entries = existing.split(DELIMITER).filter(e => e.trim());
      entries.push(entry);

      const trimmed = entries.slice(-MAX_ENTRIES).join(DELIMITER) + DELIMITER;
      fs.writeFileSync(logPath, trimmed, 'utf8');

      process.stderr.write(`[claude-craft] Unexpected error in ${scriptName} hook. Details logged to: ${logPath}\n`);
    } catch { /* ok — never let logging crash the hook */ }
  } catch { /* ok */ }
}

module.exports = { logError };
