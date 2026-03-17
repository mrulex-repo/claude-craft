---
allowed-tools: Bash(git status:*), Bash(git add:*), Bash(git diff:*), Bash(git branch:*), Bash(git commit:*)
description: Generate JIRA commit message and auto-stage all files
---

## Context
- **Current Branch:** !`git branch --show-current`
- **Current Status (All Changes):** !`git status -s`

## Instructions
1. **Analyze Workspace:**
   - Look at all modified and untracked files.
   - Parse the branch name for `type/JIRA-ID--description`.
   - **Casing:** `type` (lower), `JIRA-ID` (UPPER).

2. **Drafting:**
   - Format: subject line `<type>(<JIRA-ID>): <concise summary>` followed by a blank line and a body paragraph explaining the key changes (2-4 sentences).
   - If no JIRA pattern: subject line `<type>: <concise summary>` followed by a blank line and a body paragraph explaining the key changes (2-4 sentences).
   Do not include co authoring sign, it's on my behalf.

3. **The Approval Gate:**
   - Summarize what will be committed (everything currently changed).
   - Present the drafted message.
   - **Wait for input.**

4. **Execution Logic:**
   - **Standard Approval ("yes", "y", "go"):** - Run `git add .`
     - Run `git commit -m "<drafted message>"`
   - **Approval with Exclusions (e.g., "go except config.json"):**
     - Run `git add .`
     - Run `git reset <specified files>`
     - Run `git commit -m "<drafted message>"`
   - **Custom Message:** If you provide a new string, use that for the commit while still following the `add .` logic.
