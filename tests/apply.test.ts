import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig, resolve, apply, check } from '../src/index.js';

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/mini');
const sandboxRoot = path.join(os.tmpdir(), 'panom-drs-apply-test');

describe('apply', () => {
  afterEach(() => {
    if (fs.existsSync(sandboxRoot)) {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  function copyFixture() {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
    fs.cpSync(fixtureRoot, sandboxRoot, {
      recursive: true,
      filter: (src) => !src.includes('_missing'),
    });
  }

  it('dry-run does not write files', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const plan = resolve(config, { mode: 'auto' });
    const before = fs.readFileSync(path.join(sandboxRoot, 'apps/one/package.json'), 'utf8');
    apply(plan, { dryRun: true });
    const after = fs.readFileSync(path.join(sandboxRoot, 'apps/one/package.json'), 'utf8');
    expect(after).toBe(before);
  });

  it('apply updates drifted package.json', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const plan = resolve(config, { mode: 'auto' });
    const result = apply(plan);
    expect(result.wroteFiles.length).toBeGreaterThan(0);
    const checkResult = check(config, { mode: 'auto' });
    expect(checkResult.ok).toBe(true);
  });

  it('idempotent second apply writes nothing', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const plan = resolve(config, { mode: 'auto' });
    apply(plan);
    const result2 = apply(plan);
    expect(result2.wroteFiles.length).toBe(0);
  });

  it('detects drift and scaffolds a missing consumer package.json', () => {
    copyFixture();
    const consumerDir = path.join(sandboxRoot, 'apps/missing');
    fs.mkdirSync(consumerDir, { recursive: true });
    fs.writeFileSync(
      path.join(sandboxRoot, 'drs.config.json'),
      JSON.stringify(
        {
          version: 1,
          root: '.',
          defaults: { mode: 'auto' },
          packages: {
            '@panomapp/pkg-a': {
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

    const beforeCheck = check(config, { mode: 'auto' });
    expect(beforeCheck.ok).toBe(false);
    expect(beforeCheck.drift.some((item) => item.consumerId === 'app-missing')).toBe(true);

    const plan = resolve(config, { mode: 'auto' });
    const result = apply(plan);
    expect(result.wroteFiles).toContain(path.join(consumerDir, 'package.json'));

    const afterCheck = check(config, { mode: 'auto' });
    expect(afterCheck.ok).toBe(true);
  });
});
