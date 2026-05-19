import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig, build } from '../src/index.js';

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/mini');
const sandboxRoot = path.join(os.tmpdir(), 'panom-drs-build-test');

describe('build', () => {
  afterEach(() => {
    if (fs.existsSync(sandboxRoot)) {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
  });

  function copyFixture() {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
    fs.cpSync(fixtureRoot, sandboxRoot, {
      recursive: true,
      filter: (src) => !src.includes('_missing'),
    });
  }

  it('dry-run does not write package.json', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const before = fs.readFileSync(path.join(sandboxRoot, 'apps/one/package.json'), 'utf8');
    const result = build(config, { dryRun: true });
    const after = fs.readFileSync(path.join(sandboxRoot, 'apps/one/package.json'), 'utf8');
    expect(after).toBe(before);
    expect(result.applyResult.dryRun).toBe(true);
    expect(result.ci).toBe(false);
  });

  it('reports CI in summary when CI=true', () => {
    copyFixture();
    process.env.CI = 'true';
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const result = build(config, { dryRun: true, skipInstall: true });
    expect(result.ci).toBe(true);
    expect(result.plan.entries.every((e) => e.source === 'registry')).toBe(true);
  });

  it('full build applies and passes check', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const result = build(config, { skipInstall: true });
    expect(result.checkResult.ok).toBe(true);
    expect(result.applyResult.wroteFiles.length).toBeGreaterThan(0);
  });
});
