import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isCiEnvironment } from '../src/resolve/env.js';

describe('isCiEnvironment', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('returns false by default', () => {
    expect(isCiEnvironment()).toBe(false);
  });

  it('returns true when CI=true', () => {
    process.env.CI = 'true';
    expect(isCiEnvironment()).toBe(true);
  });

  it('returns true when GITHUB_ACTIONS=true', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(isCiEnvironment()).toBe(true);
  });
});
