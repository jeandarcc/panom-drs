import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig, build } from '../src/index.js';

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/vendored');
const sandboxRoot = path.join(os.tmpdir(), 'panom-drs-if-stale-test');

describe('build --if-stale', () => {
  afterEach(() => {
    if (fs.existsSync(sandboxRoot)) {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  it('skips build when vendored modules are fresh', () => {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
    fs.cpSync(fixtureRoot, sandboxRoot, { recursive: true });

    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });

    build(config, { skipInstall: true });
    const second = build(config, { skipInstall: true, ifStale: true });

    expect(second.skipped).toBe(true);
    expect(second.checkResult.ok).toBe(true);
  });

  it('auto-repairs when a consumer package.json is missing', () => {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
    fs.cpSync(fixtureRoot, sandboxRoot, { recursive: true });

    const consumerDir = path.join(sandboxRoot, 'apps/missing');
    fs.mkdirSync(consumerDir, { recursive: true });
    fs.writeFileSync(
      path.join(sandboxRoot, 'drs.config.json'),
      JSON.stringify(
        {
          version: 1,
          root: '.',
          defaults: { mode: 'auto', layout: 'vendored' },
          packages: {
            '@panomapp/pkg-a': {
              to: ['apps/missing'],
              local: { path: 'packages/pkg-a' },
              registry: { version: '^1.0.0' },
            },
          },
          consumers: {
            'app-missing': {
              dir: 'apps/missing',
              dependencies: ['@panomapp/pkg-a'],
            },
          },
        },
        null,
        2
      )
    );

    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });

    const result = build(config, { skipInstall: true, ifStale: true });

    expect(result.skipped ?? false).toBe(false);
    expect(result.checkResult.ok).toBe(true);
    expect(fs.existsSync(path.join(consumerDir, 'package.json'))).toBe(true);
  });
});
