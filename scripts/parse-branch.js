#!/usr/bin/env node
/**
 * Parse a git branch name for commit type and JIRA ticket ID.
 *
 * Usage: node parse-branch.js <branch-name>
 *
 * Recognised patterns:
 *   type/JIRA-ID--description  →  TYPE=feat JIRA=ABC-123
 *   type/JIRA-ID-description   →  TYPE=feat JIRA=ABC-123
 *   type/description            →  TYPE=feat JIRA=none
 *   type                        →  TYPE=feat JIRA=none
 */

const branch = process.argv[2] ?? '';

const match = branch.match(/^([a-z]+)(?:\/([A-Z]+-\d+))?/);

if (match) {
  const type = match[1];
  const jira = match[2] ?? 'none';
  process.stdout.write(`TYPE=${type} JIRA=${jira}`);
} else {
  process.stdout.write('TYPE=chore JIRA=none');
}
