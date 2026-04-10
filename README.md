# Claude Craft

**Claude Craft** (plugin name: `ccraft`) is a Claude Code plugin with a curated set of commands and utilities to boost your development workflow. The short name `ccraft` is what you use in commands, e.g. `/ccraft:commit-msg`.

## Installation

### Standard

Register the marketplace, then install the plugin:

```bash
claude plugin marketplace add mrulex-repo/claude-craft
claude plugin install ccraft@claude-craft
```

Commands are then available as `/ccraft:commit-msg`, `/ccraft:config`, etc.

### Development

Clone the repo and point Claude Code at the local directory:

```bash
git clone https://github.com/mrulex-repo/claude-craft
claude --plugin-dir /path/to/claude-craft
```

After editing commands or scripts, reload without restarting:

```
/reload-plugins
```

## Requirements

- `node` / `npm` — required by the configuration system and MCP wrappers

## MCP Servers

The plugin bundles three MCP servers. All are **disabled by default** — enable only the ones you need to avoid unnecessary token consumption.

| MCP | Description | Requirement |
|-----|-------------|-------------|
| `context7` | Up-to-date library and framework documentation lookup | — |
| `sequential-thinking` | Structured step-by-step reasoning | — |
| `github` | Repository, PR, and issue operations | `GITHUB_PERSONAL_ACCESS_TOKEN` env var |

Enable them via config:

```yaml
# ~/.claude-craft/config.yml       ← applies to all your projects
# .claude/claude-craft/config.yml  ← applies to the current project only
mcp:
  context7:
    enabled: true
  sequential-thinking:
    enabled: true
  github:
    enabled: true   # also requires: export GITHUB_PERSONAL_ACCESS_TOKEN=<token>
```

Or interactively with the `/ccraft:config` command:

```
/ccraft:config set user mcp context7.enabled true
/ccraft:config set user mcp github.enabled true
/ccraft:config set user mcp sequential-thinking.enabled true
```

Changes take effect on the next session start.

## Configuration

Configuration works at two levels — project values override user values.

| Level | Path | Scope |
|-------|------|-------|
| User | `~/.claude-craft/config.yml` | All your projects |
| Project | `.claude/claude-craft/config.yml` | Current repo only |

Use the `/ccraft:config` command to view or set values interactively, or edit the files directly:

```yaml
# example config.yml
commit-msg:
  auto-approval: false  # skip the approval gate and commit immediately
```

If neither file exists, all commands and MCPs use their default values.

## Commands

| Command | Description | Dependencies | Config options |
|---------|-------------|--------------|----------------|
| `/ccraft:commit-msg` | Generate a conventional commit message and auto-stage all files | `git` | `auto-approval` (default: `false`) |
| `/ccraft:config` | View and set configuration values at user or project level | — | — |

## Automatic Behaviors

Claude Craft installs hooks that run silently in the background on every session.

### Commit Guard

Prevents Claude from running `git commit` unless it was initiated through the `/ccraft:commit-msg` workflow. When you approve a commit message, a snapshot of the staged tree is saved. The guard verifies the snapshot matches before allowing the commit through, and rejects it if the staged files have changed since approval.

Set `commit-msg.auto-approval: true` to disable the gate entirely.

### Verify

Runs shell commands automatically whenever Claude modifies files. Useful for keeping tests green or linting in sync without having to ask Claude explicitly.

**How it works:**

1. After every file edit (Edit, Write, Bash), a `changes_pending` flag is written to `.claude/`.
2. When Claude finishes responding (Stop), if the flag is present and git shows actual changes, the configured commands run.
3. If any command fails, the relevant error output is surfaced to Claude before it can reply, so it can fix the issue.

`.claude/changes_pending` is automatically added to `.claude/.gitignore` — it is transient and should not be committed.

**Configuration:**

```yaml
# .claude/claude-craft/config.yml  (project-level recommended)
verify:
  commands:
    - npm test
    - npm run lint
  timeout: 60   # seconds per command, default 120
```

Verification is skipped when no commands are configured and `verify.enabled` is not explicitly set to `true`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and [CONTRIBUTORS.md](CONTRIBUTORS.md) for the list of contributors.

## License

MIT
