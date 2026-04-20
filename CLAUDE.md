# CLAUDE.md — CAN-DO-BE Local Build

## Git policy
- Never use git worktrees or `isolation: "worktree"` when spawning agents.
- Always work directly in the main repository: `C:\Users\Owner\Desktop\git\CANDOBE_LOCAL_BUILD_1\code`
- Do not create extra branches for agent work unless the user explicitly asks.

## Working directory
All file edits go to `C:\Users\Owner\Desktop\git\CANDOBE_LOCAL_BUILD_1\code\src\...`
Do not write to `.claude/worktrees/` or any nested copy of the repo.
