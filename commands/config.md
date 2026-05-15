---
allowed-tools: Bash(node ~/.claude-craft/get-merged-config.js:*), Bash(node ~/.claude-craft/set-config.js:*), Bash(node ~/.claude-craft/validate-config.js:*)
description: View and set Claude Craft configuration values
---

## Current configuration

!`node ~/.claude-craft/get-merged-config.js`

## Validation

!`node ~/.claude-craft/validate-config.js`

## Available Options

| Command | Key | Default | Description |
|---------|-----|---------|-------------|
| `commit-msg` | `auto-approval` | `false` | When `false`, Claude presents the commit message and waits for your approval before committing. Set to `true` to skip the gate and commit immediately. |
| `mcp` | `context7.enabled` | `false` | Enable the context7 MCP server (up-to-date library and framework documentation lookup) |
| `mcp` | `sequential-thinking.enabled` | `false` | Enable the sequential-thinking MCP server (structured step-by-step reasoning) |
| `mcp` | `github.enabled` | `false` | Enable the GitHub MCP server (repository, PR, and issue operations) — requires `GITHUB_PERSONAL_ACCESS_TOKEN` env var |
| `notify` | `enabled` | `false` | Show an OS notification when the agent finishes |
| `verify` | `enabled` | `false` | Explicitly enable verification even without commands |
| `verify` | `commands` | `[]` | Shell commands to run after changes are detected (e.g. `npm test`) |
| `verify` | `timeout` | `PT2M` | Timeout per verification command as ISO 8601 duration (e.g. `PT2M`, `PT5M30S`) |

## Instructions

Interpret the user's request and act accordingly:

- **View config** — show the current configuration as displayed above.
- **Set a value** — run `node ~/.claude-craft/set-config.js <level> <command> <key> <value>`.
  - Use `project` when the user says "project", "this repo", "locally", or similar.
  - Use `user` when the user says "globally", "for me", "user level", or gives no specific level.
- **Unknown intent** — show the available options table and ask what the user would like to change.

After setting a value, confirm what was changed and at which level.
