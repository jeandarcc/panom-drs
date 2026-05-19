# @panomapp/drs

**D**ependency **R**esolver — single `drs.config.json` for local `file:` vs registry specifiers across consumers.

## Quickstart

Write [`drs.config.json`](./schema/drs.config.schema.json) with `"defaults": { "mode": "auto" }`, then:

```bash
# From monorepo root
npx drs build
# or
npm run drs:build
```

That is the only command you need for day-to-day work: updates consumer `package.json` files, builds local packages when needed, runs `npm install` in each consumer, and verifies drift.

## What `auto` does

| Where | `auto` behavior |
|-------|-----------------|
| Your machine (paths exist) | `file:../local-package` + local `npm run build` |
| CI (`CI=true` or `GITHUB_ACTIONS=true`) | `registry.version` from config (npm), even if folders exist in checkout |
| Machine, path missing | registry |

No need to set `DRS_MODE` for the usual local vs CI split.

## Config

```json
{
  "$schema": "./node_modules/@panomapp/drs/schema/drs.config.schema.json",
  "version": 1,
  "root": ".",
  "defaults": { "mode": "auto" },
  "packages": {
    "@panomapp/my-pkg": {
      "local": { "path": "packages/my-pkg", "build": "npm run build" },
      "registry": { "version": "^1.0.0" }
    }
  },
  "consumers": {
    "app": {
      "dir": "apps/my-app",
      "dependencies": ["@panomapp/my-pkg"]
    }
  }
}
```

## Modes

| Mode | Behavior |
|------|----------|
| `local` | Always `file:<path>` (fails if path missing) |
| `registry` | Always `registry.version` |
| `auto` | CI → registry; otherwise local if path exists, else registry |

## Environment (overrides)

| Variable | Description |
|----------|-------------|
| `DRS_CONFIG` | Path to config file |
| `DRS_MODE` | Force global mode (`local` / `registry` / `auto`) |
| `DRS_PACKAGE_@panomapp__my-pkg` | Per-package mode (`/` → `__`) |

Example: everything local except one package from npm:

```bash
DRS_MODE=local DRS_PACKAGE_@panomapp__hsm-panom-contract=registry drs build
```

## CLI

```bash
drs build [--dry-run] [--skip-install] [--verbose]
drs resolve [--print human|json]
drs apply [--dry-run] [--build] [--install]
drs check
drs init
drs docker
```

## GitHub Actions

```yaml
- uses: actions/checkout@v4
- run: npm ci && npm run build
  working-directory: panom-drs
- run: npm install
- run: npx drs build
```

`auto` detects CI and uses registry specifiers; `npm install` in consumers pulls from npm.

## Programmatic API

```ts
import { loadConfig, build } from '@panomapp/drs';

const config = loadConfig();
const result = build(config);
```

## Panom

Root [drs.config.json](../drs.config.json). Primary script:

```bash
npm run drs:build
```

Legacy `deps:link-local` in frontend → `npm run drs:build` from repo root.

## Publishing

```bash
cd panom-drs
npm test && npm run build
npm version minor   # or patch
npm publish --access public
```
