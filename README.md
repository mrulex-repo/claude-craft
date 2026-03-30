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

Create `~/.claude-craft/config.yml` to customize command behaviour:

```yaml
commit-msg:
  auto-approval: false  # skip the approval gate and commit immediately
```

If the file does not exist, all commands use their default values.

## Commands

| Command | Description | Dependencies | Config options |
|---------|-------------|--------------|----------------|
| `/claude-craft:commit-msg` | Generate a conventional commit message and auto-stage all files | `git` | `auto-approval` (default: `false`) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and [CONTRIBUTORS.md](CONTRIBUTORS.md) for the list of contributors.

## License

MIT
