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
});
