import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { toFileSpecifier, normalizeForCompare } from '../src/resolve/paths.js';

describe('paths', () => {
  it('builds posix file specifier relative to consumer', () => {
    const consumer = '/repo/apps/one';
    const pkg = '/repo/packages/pkg-a';
    expect(toFileSpecifier(consumer, pkg)).toBe('file:../../packages/pkg-a');
  });

  it('normalizeForCompare treats file paths equally', () => {
    expect(normalizeForCompare('file:../pkg')).toBe(normalizeForCompare('file:./../pkg'));
  });

  it('posix relative on windows-style join', () => {
    const consumer = path.join('/repo', 'apps', 'one');
    const pkg = path.join('/repo', 'packages', 'pkg-a');
    const spec = toFileSpecifier(consumer, pkg);
    expect(spec).not.toContain('\\');
    expect(spec).toBe('file:../../packages/pkg-a');
  });
});
