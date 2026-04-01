# Claude Craft

**Claude Craft** (plugin name: `ccraft`) is a Claude Code plugin with a curated set of commands and utilities to boost your development workflow. The short name `ccraft` is what you use in commands, e.g. `/ccraft:commit-msg`.

## Installation

### Standard

Install directly from GitHub:

```bash
claude plugin install https://github.com/mrulex/claude-craft
```

Commands are then available as `/ccraft:commit-msg`, `/ccraft:config`, etc.

### Development

Clone the repo and point Claude Code at the local directory:

```bash
git clone https://github.com/mrulex/claude-craft
claude --plugin-dir /path/to/claude-craft
```

After editing commands or scripts, reload without restarting:

```
/reload-plugins
```

## Requirements

- `node` / `npm` — required by the configuration system and MCP wrappers

## MCP Servers

The plugin bundles three MCP servers that are enabled by default (except `sequential-thinking`):

| MCP | Default | Description |
|-----|---------|-------------|
| `context7` | enabled | Library documentation lookup |
| `sequential-thinking` | disabled | Structured reasoning |
| `github` | enabled | Repository and PR operations — requires `GITHUB_PERSONAL_ACCESS_TOKEN` |

Toggle them via config:

```yaml
# ~/.claude-craft/config.yml  or  .claude/claude-craft/config.yml
mcp:
  context7:
    enabled: true
  sequential-thinking:
    enabled: false
  github:
    enabled: true   # export GITHUB_PERSONAL_ACCESS_TOKEN=<token>
```

Or with the `/ccraft:config` command:

```bash
/ccraft:config set user mcp context7.enabled false
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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and [CONTRIBUTORS.md](CONTRIBUTORS.md) for the list of contributors.

## License

MIT
