# Contributing to Claude Craft

## Command Guidelines

### Configuration

Commands can read user-defined configuration from `~/.claude-craft/config.yml`. The file structure is:

```yaml
command-name:
  option-key: value
```

To read a value inside a command, use the `get-config.js` helper (deployed automatically on session start):

```markdown
## Configuration
- **My Option:** !`node ~/.claude-craft/get-config.js command-name option-key default-value 2>/dev/null || echo "default-value"`
```

Always provide a default value as the third argument. If the config file or the key is absent, the default is used. Document each option in the README under the command's entry.

### Shared Scripts

Reusable Node scripts live in `scripts/` and are deployed to `~/.claude-craft/` by the `SessionStart` hook. Add any new script to the hook command in `hooks/hooks.json` so it is available at runtime.

Use them in commands via `!` bash directives:

```markdown
- **Branch Parsed:** !`node ~/.claude-craft/parse-branch.js "$(git branch --show-current)" 2>/dev/null || echo ""`
```

### File Hygiene

Any file the plugin creates as part of its own procedures (state files, temp files, locks, logs) must not appear as untracked or modified files in the user's project. Every such file must be covered by one of:

- An entry in the relevant `.gitignore` (e.g. `.claude/.gitignore` for files inside `.claude/`)
- Deleted immediately after use

Each script that writes a runtime file is responsible for calling `ensureGitignoreEntries(claudeDir)` immediately before the write — do not rely on another script to do it later. When adding a new runtime file:

1. Add its name to `GITIGNORE_ENTRIES` in every script that writes it (the constant is duplicated by design — each script is self-contained).
2. Call `ensureGitignoreEntries(claudeDir)` right before the `fs.writeFileSync` that creates the file.

Never leave plugin-internal files exposed to the user's `git status`.

### External Dependencies

If a command requires an external CLI tool (anything other than `git`):

1. **Add a dependency check at the top of the command** so Claude aborts with a clear install message instead of failing silently:

   ```markdown
   ## Dependency Check
   !`command -v <tool> >/dev/null 2>&1 && echo "OK" || echo "MISSING: <tool> is required. Install it with: brew install <tool> (macOS) or apt install <tool> (Linux)"`

   If the dependency check above shows MISSING, stop immediately, display the install instructions, and do not continue.
   ```

2. **Add the dependency to the README** under the command's entry in the commands table, so users know what to install before using it.
