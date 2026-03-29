---
name: update
description: Update dependencies, fix deprecations and warnings
---

## Step 1: Check for Updates

```bash
npm outdated || true
```

Review the output. Note which packages have major vs minor/patch updates available.

## Step 2: Update Dependencies

```bash
# Update all packages within semver ranges
npm update

# Check for security vulnerabilities
npm audit
```

For major version bumps, update `package.json` version ranges manually after researching changelogs for breaking changes. Use `npm install <pkg>@latest` for intentional major upgrades.

This is a monorepo with workspaces (`protocol`, `relay`, `bridge`, `sdk`) — run `npm outdated -ws` to check workspace packages too.

## Step 3: Check for Deprecations & Warnings

```bash
# Clean install to surface all warnings
npm install 2>&1
```

Read ALL output carefully. Look for:

- `npm warn deprecated` — packages that need replacement
- `EBADENGINE` — Node.js version mismatches
- `ERESOLVE` — peer dependency conflicts
- Security vulnerability notices

## Step 4: Fix Issues

For each warning or deprecation:

1. Research the recommended replacement (use `web_fetch` on the package's npm page or changelog)
2. Update the dependency or replace it with the recommended alternative
3. If code imports from deprecated APIs, update the import paths and usage
4. Re-run `npm install` and verify the warning is gone

## Step 5: Run Quality Checks

```bash
npm run typecheck
npm run lint:fix
npm run format
```

Fix all errors before completing. Type errors are common after major dependency updates.

## Step 6: Verify Clean Install

```bash
rm -rf node_modules package-lock.json
npm install 2>&1
```

Verify ZERO warnings and errors in the output. Then re-run quality checks:

```bash
npm run typecheck
npm run lint
npm run format:check
```
