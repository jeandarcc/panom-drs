import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import {
  loadConfig,
  resolve,
  getVendoringPlan,
  syncVendoredModules,
  copyVendoredDistArtifacts,
  check,
} from '../src/index.js';

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/vendored');
const sandboxRoot = path.join(os.tmpdir(), 'panom-drs-vendored-test');

describe('vendored layout', () => {
  afterEach(() => {
    if (fs.existsSync(sandboxRoot)) {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
  });

  function copyFixture() {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
    fs.cpSync(fixtureRoot, sandboxRoot, { recursive: true });
  }

  it('resolves vendored specifiers under generated_modules', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const plan = resolve(config, { mode: 'auto' });
    const appEntry = plan.entries.find((e) => e.consumerId === 'app' && e.name === '@panomapp/pkg-a');
    expect(appEntry?.layout).toBe('vendored');
    expect(appEntry?.specifier).toBe('file:./generated_modules/packages/pkg-a');
  });

  it('uses registry when package to[] excludes consumer', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const plan = resolve(config, { mode: 'auto' });
    const otherEntry = plan.entries.find(
      (e) => e.consumerId === 'other-app' && e.name === '@panomapp/pkg-a'
    );
    expect(otherEntry?.source).toBe('registry');
    expect(otherEntry?.specifier).toBe('9.9.9');
  });

  it('auto stays local in CI for vendored consumers', () => {
    copyFixture();
    process.env.CI = 'true';
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const plan = resolve(config, { mode: 'auto' });
    const appEntry = plan.entries.find((e) => e.consumerId === 'app' && e.name === '@panomapp/pkg-a');
    expect(appEntry?.source).toBe('local');
  });

  it('syncs source into generated_modules and rewrites internal deps', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const consumerDir = path.join(sandboxRoot, 'apps/one');
    syncVendoredModules(config, consumerDir);

    const generatedPkgB = path.join(consumerDir, 'generated_modules/packages/pkg-b/package.json');
    expect(fs.existsSync(generatedPkgB)).toBe(true);
    const generatedPkgA = JSON.parse(
      fs.readFileSync(path.join(consumerDir, 'generated_modules/packages/pkg-a/package.json'), 'utf8')
    ) as { dependencies?: Record<string, string> };
    expect(generatedPkgA.dependencies?.['@panomapp/pkg-b']).toMatch(/^file:\.\.\/pkg-b$/);
  });

  it('copies dist artifacts from source trees into vendored packages', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const consumerDir = path.join(sandboxRoot, 'apps/one');
    syncVendoredModules(config, consumerDir);
    const copied = copyVendoredDistArtifacts(config, consumerDir);
    expect(copied).toContain('generated_modules/packages/pkg-a');
    expect(
      fs.existsSync(path.join(consumerDir, 'generated_modules/packages/pkg-a/dist/index.js'))
    ).toBe(true);
  });

  it('builds vendoring plan in dependency order', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const plan = getVendoringPlan(config, path.join(sandboxRoot, 'apps/one'));
    expect(plan.sourcePackages.map((pkg) => pkg.name)).toEqual(['@panomapp/pkg-b', '@panomapp/pkg-a']);
    expect(plan.installCommand).toContain('file:./generated_modules/packages/pkg-a');
  });

  it('detects vendored drift when generated_modules is missing', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const result = check(config, { mode: 'auto' });
    expect(result.vendoredDrift.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  it('passes check after sync and dist copy', () => {
    copyFixture();
    const config = loadConfig({
      configPath: path.join(sandboxRoot, 'drs.config.json'),
      cwd: sandboxRoot,
    });
    const consumerDir = path.join(sandboxRoot, 'apps/one');
    syncVendoredModules(config, consumerDir);
    copyVendoredDistArtifacts(config, consumerDir);
    const result = check(config, { mode: 'auto' });
    expect(result.vendoredDrift).toEqual([]);
    expect(result.ok).toBe(false);
  });
});
