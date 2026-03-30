# Claude Craft

A Claude Code plugin with a curated set of commands and utilities to boost your development workflow.

## Installation

```bash
claude plugin install claude-craft
```

Or test locally:

```bash
claude --plugin-dir /path/to/claude-craft
```

## Requirements

- `node` / `npm` — required by the configuration system

## Configuration

Configuration works at two levels — project values override user values.

| Level | Path | Scope |
|-------|------|-------|
| User | `~/.claude-craft/config.yml` | All your projects |
| Project | `.claude/claude-craft/config.yml` | Current repo only |

Use the `/claude-craft:config` command to view or set values interactively, or edit the files directly:

```yaml
# example config.yml
commit-msg:
  auto-approval: false  # skip the approval gate and commit immediately
```

If neither file exists, all commands use their default values.

## Commands

| Command | Description | Dependencies | Config options |
|---------|-------------|--------------|----------------|
| `/claude-craft:commit-msg` | Generate a conventional commit message and auto-stage all files | `git` | `auto-approval` (default: `false`) |
| `/claude-craft:config` | View and set configuration values at user or project level | — | — |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and [CONTRIBUTORS.md](CONTRIBUTORS.md) for the list of contributors.

## License

MIT
