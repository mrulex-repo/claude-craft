# Contributing to Claude Craft

## Command Guidelines

### External Dependencies

If a command requires an external CLI tool (anything other than `git`):

1. **Add a dependency check at the top of the command** so Claude aborts with a clear install message instead of failing silently:

   ```markdown
   ## Dependency Check
   !`command -v <tool> >/dev/null 2>&1 && echo "OK" || echo "MISSING: <tool> is required. Install it with: brew install <tool> (macOS) or apt install <tool> (Linux)"`

   If the dependency check above shows MISSING, stop immediately, display the install instructions, and do not continue.
   ```

2. **Add the dependency to the README** under the command's entry in the commands table, so users know what to install before using it.
