---
name: fix
description: Run typechecking and linting, then spawn parallel agents to fix all issues
---

Run all linting and typechecking tools, collect errors, group them by domain, and use the subagent tool to spawn parallel sub-agents to fix them.

## Step 1: Run Checks

Run all three checks and capture output. Do NOT stop on failure — collect all errors first.

```bash
# TypeScript type checking
npm run typecheck 2>&1 || true

# ESLint (includes Prettier violations via eslint-plugin-prettier)
npm run lint 2>&1 || true

# Prettier format check (catches files ESLint doesn't cover like .json, .md)
npm run format:check 2>&1 || true
```

Run each command separately and save the full output of each.

## Step 2: Collect and Group Errors

Parse the output from Step 1. Group errors into these domains:

- **Type errors**: TypeScript errors from `npm run typecheck` (lines matching `TS\d+`)
- **Lint errors**: ESLint rule violations from `npm run lint` (lines with rule names like `@typescript-eslint/*`, `no-unused-vars`, `prettier/prettier`, etc.)
- **Format errors**: Prettier issues from `npm run format:check` (files listed as needing formatting)

If there are zero errors across all domains, report success and stop.

## Step 3: Spawn Parallel Agents

For each domain that has errors, use the `subagent` tool to spawn a sub-agent to fix all errors in that domain. Spawn all agents in parallel (in the same response).

**Type errors agent prompt**: "Fix all TypeScript type errors in the project at /Users/kenkai/Documents/UnstableMind/agent-home. Here are the errors:\n\n{paste exact typecheck output}\n\nRead each file, fix the type errors, and verify by running: npm run typecheck"

**Lint errors agent prompt**: "Fix all ESLint errors in the project at /Users/kenkai/Documents/UnstableMind/agent-home. Here are the errors:\n\n{paste exact lint output}\n\nFirst try auto-fix with `npm run lint:fix`. Then read any remaining files with errors and fix them manually. Verify by running: npm run lint"

**Format errors agent prompt**: "Fix all Prettier formatting issues in the project at /Users/kenkai/Documents/UnstableMind/agent-home. Here are the files with issues:\n\n{paste exact format:check output}\n\nRun `npm run format` to auto-fix all formatting. Verify by running: npm run format:check"

## Step 4: Verify

After all agents complete, re-run ALL checks to confirm everything is clean:

```bash
npm run typecheck
npm run lint
npm run format:check
```

If any issues remain, fix them directly — do not spawn more agents. Then re-run checks until all pass.
