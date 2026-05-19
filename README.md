# @panomapp/drs

**D**ependency **R**esolver — single `drs.config.json` for local `file:` vs registry specifiers across consumers.

## Quickstart

```bash
# From monorepo root (with drs.config.json)
DRS_MODE=local npx drs apply --build
npx drs check
```

## Config

See [schema/drs.config.schema.json](./schema/drs.config.schema.json).

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
| `auto` | Local if path exists, else registry |

## Environment

| Variable | Description |
|----------|-------------|
| `DRS_CONFIG` | Path to config file |
| `DRS_MODE` | Override global mode |
| `DRS_PACKAGE_@panomapp__my-pkg` | Per-package mode (`/` → `__`) |

## CLI

```bash
drs resolve [--print human|json] [--mode auto]
drs apply [--dry-run] [--build] [--install]
drs check
drs init
drs docker
```

## GitHub Actions (local paths, no registry for listed packages)

```yaml
- uses: actions/checkout@v4
- run: npm run build --prefix panom-drs
- env:
    DRS_MODE: local
  run: node panom-drs/dist/cli.cjs apply --build --config drs.config.json
- run: npm ci
  working-directory: panom-backend
- run: node panom-drs/dist/cli.cjs check --config drs.config.json
```

## Programmatic API

```ts
import { loadConfig, resolve, apply, check, formatPlan } from '@panomapp/drs';

const config = loadConfig();
const plan = resolve(config, { mode: 'local' });
apply(plan, { runBuild: true });
const result = check(config);
```

## Panom

Panom uses root [drs.config.json](../drs.config.json). Replace legacy `deps:link-local` with:

```bash
npm run drs:apply
```
