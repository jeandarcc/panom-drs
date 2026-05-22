import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import {
  loadConfig,
  build,
  syncVendoredModules,
  copyVendoredDistArtifacts,
  check,
  writeVendorStampForConsumer,
} from '../src/index.js';

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/vendored');
const sandboxRoot = path.join(os.tmpdir(), 'panom-drs-incremental-sync-test');

describe('incremental vendored sync', () => {
  afterEach(() => {
    if (fs.existsSync(sandboxRoot)) {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  function copyFixture() {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
    fs.cpSync(fixtureRoot, sandboxRoot, { recursive: true });
  }

  it('copies only changed source files on subsequent sync', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const consumerDir = path.join(sandboxRoot, 'apps/one');

    const first = syncVendoredModules(config, consumerDir);
    expect(first.copied.length).toBeGreaterThan(0);

    const unchangedTarget = path.join(
      consumerDir,
      'generated_modules/packages/pkg-a/build.cjs'
    );
    const beforeMtime = fs.statSync(unchangedTarget).mtimeMs;

    const second = syncVendoredModules(config, consumerDir);
    expect(second.copied).toEqual([]);
    expect(second.removed).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);
    expect(fs.statSync(unchangedTarget).mtimeMs).toBe(beforeMtime);
  });

  it('updates only the touched file and removes deleted source files', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const consumerDir = path.join(sandboxRoot, 'apps/one');
    syncVendoredModules(config, consumerDir);

    const sourceFile = path.join(sandboxRoot, 'packages/pkg-a/build.cjs');
    const generatedFile = path.join(
      consumerDir,
      'generated_modules/packages/pkg-a/build.cjs'
    );
    const extraSource = path.join(sandboxRoot, 'packages/pkg-a/extra.txt');
    const extraGenerated = path.join(
      consumerDir,
      'generated_modules/packages/pkg-a/extra.txt'
    );

    fs.writeFileSync(extraSource, 'temporary\n', 'utf8');
    syncVendoredModules(config, consumerDir);
    expect(fs.existsSync(extraGenerated)).toBe(true);

    fs.writeFileSync(sourceFile, fs.readFileSync(sourceFile, 'utf8') + '\n', 'utf8');
    fs.rmSync(extraSource, { force: true });

    const updated = syncVendoredModules(config, consumerDir);
    expect(updated.copied).toEqual(['@panomapp/pkg-a:build.cjs']);
    expect(updated.removed).toEqual(['@panomapp/pkg-a:extra.txt']);
    expect(fs.readFileSync(generatedFile, 'utf8')).toBe(fs.readFileSync(sourceFile, 'utf8'));
    expect(fs.existsSync(extraGenerated)).toBe(false);
  });

  it('copies only changed dist files incrementally', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const consumerDir = path.join(sandboxRoot, 'apps/one');
    syncVendoredModules(config, consumerDir);

    copyVendoredDistArtifacts(config, consumerDir);
    const generatedDist = path.join(
      consumerDir,
      'generated_modules/packages/pkg-a/dist/index.js'
    );
    const before = fs.readFileSync(generatedDist, 'utf8');

    copyVendoredDistArtifacts(config, consumerDir);
    expect(fs.readFileSync(generatedDist, 'utf8')).toBe(before);

    const sourceDist = path.join(sandboxRoot, 'packages/pkg-a/dist/index.js');
    fs.writeFileSync(sourceDist, `${before}// changed\n`, 'utf8');
    copyVendoredDistArtifacts(config, consumerDir);
    expect(fs.readFileSync(generatedDist, 'utf8')).toContain('// changed');
  });

  it('passes check with file-level stamp after sync and dist copy', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const consumerDir = path.join(sandboxRoot, 'apps/one');
    syncVendoredModules(config, consumerDir);
    copyVendoredDistArtifacts(config, consumerDir);
    writeVendorStampForConsumer(config, consumerDir);

    const stamp = JSON.parse(
      fs.readFileSync(path.join(consumerDir, '.drs-vendor-stamp.json'), 'utf8')
    ) as { version: number; packages: Record<string, { files: Record<string, unknown> }> };
    expect(stamp.version).toBe(2);
    expect(Object.keys(stamp.packages['@panomapp/pkg-a']?.files ?? {}).length).toBeGreaterThan(0);

    const result = check(config, { mode: 'auto' });
    expect(result.vendoredDrift).toEqual([]);
  });

  it('preserves nested relative paths while fingerprinting and syncing', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const consumerDir = path.join(sandboxRoot, 'apps/one');
    const nestedDir = path.join(sandboxRoot, 'packages/pkg-a/nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'note.txt'), 'nested payload\n', 'utf8');

    syncVendoredModules(config, consumerDir);
    expect(
      fs.existsSync(
        path.join(consumerDir, 'generated_modules/packages/pkg-a/nested/note.txt')
      )
    ).toBe(true);
  });

  it('if-stale stays fast after file-level stamp is written', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });

    build(config, { skipInstall: true });
    const second = build(config, { skipInstall: true, ifStale: true });
    expect(second.skipped).toBe(true);
    expect(second.checkResult.ok).toBe(true);
  });
});
