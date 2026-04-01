---
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git branch:*), Bash(git commit:*), Bash(node ~/.claude-craft/approve-commit.js --from-workflow:*)
description: Generate JIRA commit message and auto-stage all files
---

## Configuration
- **Auto Approval:** !`node ~/.claude-craft/get-config.js commit-msg auto-approval false 2>/dev/null || echo "false"`

## Context
- **Current Branch:** !`git branch --show-current`
- **Branch Parsed:** !`node ~/.claude-craft/parse-branch.js "$(git branch --show-current)" 2>/dev/null || echo ""`
- **Current Status (All Changes):** !`git status -s`

## Instructions
1. **Analyze Workspace:**
   - Look at all modified and untracked files.
   - Use **Branch Parsed** for type and JIRA-ID — do not re-parse the branch yourself.
   - **Casing:** `type` (lower), `JIRA-ID` (UPPER).

2. **Drafting:**
   - Format: subject line `<type>(<JIRA-ID>): <concise summary>` followed by a blank line and a body paragraph explaining the key changes (2-4 sentences).
   - If no JIRA pattern: subject line `<type>: <concise summary>` followed by a blank line and a body paragraph explaining the key changes (2-4 sentences).
   Do not include co authoring sign, it's on my behalf.

3. **The Approval Gate:**
   - If **Auto Approval** (from Configuration above) is `true`: skip this step and proceed directly to Execution Logic using Standard Approval.
   - Otherwise: summarize what will be committed (everything currently changed), present the drafted message, and **wait for input.**

4. **Execution Logic:**
   - **Standard Approval ("yes", "y", "go"):**
     - Run `node ~/.claude-craft/approve-commit.js --from-workflow`
     - Run `git commit -m "<drafted message>"`
   - **Approval with Exclusions (e.g., "go except config.json"):**
     - Run `node ~/.claude-craft/approve-commit.js --from-workflow --except <file1> <file2> ...`
     - Run `git commit -m "<drafted message>"`
   - **Custom Message:** If you provide a new string, use that for the commit message.
