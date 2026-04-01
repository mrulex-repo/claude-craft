---
allowed-tools: Bash(git rev-parse:*), Bash(cat:*), Bash(node ~/.claude-craft/set-config.js:*), Bash(node ~/.claude-craft/validate-config.js:*)
description: View and set Claude Craft configuration values
---

## Current Configuration

**User level** (`~/.claude-craft/config.yml`):
!`cat ~/.claude-craft/config.yml 2>/dev/null || echo "(empty)"`

**Project level** (`.claude/claude-craft/config.yml`):
!`cat "$(git rev-parse --show-toplevel 2>/dev/null || echo .)/.claude/claude-craft/config.yml" 2>/dev/null || echo "(empty)"`

## Validation

!`node ~/.claude-craft/validate-config.js`

## Available Options

| Command | Key | Default | Description |
|---------|-----|---------|-------------|
| `commit-msg` | `auto-approval` | `false` | When `false`, Claude presents the commit message and waits for your approval before committing. Set to `true` to skip the gate and commit immediately. |
| `verify` | `enabled` | `false` | Explicitly enable verification even without commands |
| `verify` | `commands` | `[]` | Shell commands to run after changes are detected |
| `verify` | `timeout` | `120` | Timeout in seconds for each verification command |

## Instructions

Interpret the user's request and act accordingly:

- **View config** — show the current configuration at both levels as displayed above.
- **Set a value** — run `node ~/.claude-craft/set-config.js <level> <command> <key> <value>`.
  - Use `project` when the user says "project", "this repo", "locally", or similar.
  - Use `user` when the user says "globally", "for me", "user level", or gives no specific level.
- **Unknown intent** — show the available options table and ask what the user would like to change.

After setting a value, confirm what was changed and at which level.
