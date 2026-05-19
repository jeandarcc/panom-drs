import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { loadConfig, resolve, check } from '../src/index.js';

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/mini');

describe('resolve', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    delete process.env.DRS_MODE;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
  });

  afterEach(() => {
    process.env = envBackup;
  });

  function loadFixture() {
    return loadConfig({ configPath: path.join(fixtureRoot, 'drs.config.json'), cwd: fixtureRoot });
  }

  it('auto mode uses local file: when package path exists', () => {
    const config = loadFixture();
    const plan = resolve(config, { mode: 'auto' });
    const appOne = plan.entries.find((e) => e.consumerId === 'app-one' && e.name === '@panomapp/pkg-a');
    expect(appOne?.source).toBe('local');
    expect(appOne?.specifier).toMatch(/^file:\.\.\/\.\.\/packages\/pkg-a$/);
  });

  it('registry mode uses version string', () => {
    const config = loadFixture();
    const plan = resolve(config, { mode: 'registry' });
    expect(plan.entries.every((e) => e.source === 'registry')).toBe(true);
    expect(plan.entries.find((e) => e.name === '@panomapp/pkg-b')?.specifier).toBe('2.0.0');
  });

  it('local mode throws when path missing', () => {
    const missingRoot = path.join(fixtureRoot, '_missing_local');
    fs.mkdirSync(path.join(missingRoot, 'apps/one'), { recursive: true });
    fs.copyFileSync(
      path.join(fixtureRoot, 'drs.config.json'),
      path.join(missingRoot, 'drs.config.json')
    );
    fs.writeFileSync(
      path.join(missingRoot, 'apps/one/package.json'),
      JSON.stringify({ name: 'x', dependencies: {} }),
      'utf8'
    );
    const config = loadConfig({
      configPath: path.join(missingRoot, 'drs.config.json'),
      cwd: missingRoot,
    });
    config.packages['@panomapp/pkg-a'].local.path = 'packages/nonexistent';
    expect(() => resolve(config, { mode: 'local' })).toThrow(/local path missing/);
    fs.rmSync(missingRoot, { recursive: true, force: true });
  });

  it('auto falls back to registry when local path missing', () => {
    const missingRoot = path.join(fixtureRoot, '_missing_auto');
    fs.mkdirSync(path.join(missingRoot, 'apps/one'), { recursive: true });
    const cfg = JSON.parse(
      fs.readFileSync(path.join(fixtureRoot, 'drs.config.json'), 'utf8')
    ) as Record<string, unknown>;
    (cfg as { packages: Record<string, { local: { path: string } }> }).packages[
      '@panomapp/pkg-a'
    ].local.path = 'packages/ghost';
    fs.writeFileSync(path.join(missingRoot, 'drs.config.json'), JSON.stringify(cfg), 'utf8');
    fs.writeFileSync(
      path.join(missingRoot, 'apps/one/package.json'),
      JSON.stringify({ name: 'x', dependencies: { '@panomapp/pkg-a': '^1.0.0' } }),
      'utf8'
    );
    const config = loadConfig({
      configPath: path.join(missingRoot, 'drs.config.json'),
      cwd: missingRoot,
    });
    const plan = resolve(config, { mode: 'auto' });
    expect(plan.entries[0]?.source).toBe('registry');
    fs.rmSync(missingRoot, { recursive: true, force: true });
  });

  it('DRS_MODE env overrides defaults', () => {
    process.env.DRS_MODE = 'registry';
    const config = loadFixture();
    const plan = resolve(config);
    expect(plan.entries[0]?.source).toBe('registry');
  });

  it('auto mode uses registry in CI even when local path exists', () => {
    process.env.CI = 'true';
    const config = loadFixture();
    const plan = resolve(config, { mode: 'auto' });
    expect(plan.entries.every((e) => e.source === 'registry')).toBe(true);
  });
});

describe('check', () => {
  it('detects drift on app-one', () => {
    const config = loadConfig({
      configPath: path.join(fixtureRoot, 'drs.config.json'),
      cwd: fixtureRoot,
    });
    const result = check(config, { mode: 'auto' });
    expect(result.ok).toBe(false);
    expect(result.drift.some((d) => d.consumerId === 'app-one')).toBe(true);
  });

  it('app-two matches local file specifiers', () => {
    const config = loadConfig({
      configPath: path.join(fixtureRoot, 'drs.config.json'),
      cwd: fixtureRoot,
    });
    const plan = resolve(config, { mode: 'auto' });
    const twoEntries = plan.entries.filter((e) => e.consumerId === 'app-two');
    const result = check(config, { mode: 'auto' });
    const twoDrift = result.drift.filter((d) => d.consumerId === 'app-two');
    expect(twoDrift.length).toBe(0);
    expect(twoEntries.length).toBe(2);
  });
});
