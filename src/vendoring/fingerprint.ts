import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_EXCLUDES = new Set([
  '.git',
  'node_modules',
  'dist',
  '.turbo',
  '.next',
  '.DS_Store',
  '.drs-vendor-stamp.json',
]);

export function hashDirectory(
  rootDir: string,
  exclude: ReadonlySet<string> = DEFAULT_EXCLUDES
): string | null {
  if (!fs.existsSync(rootDir)) {
    return null;
  }

  const hash = crypto.createHash('sha256');
  const files: string[] = [];

  walkDirectory(rootDir, rootDir, exclude, files);
  files.sort();

  for (const relativePath of files) {
    const absolutePath = path.join(rootDir, relativePath);
    hash.update(relativePath);
    hash.update('\0');
    hash.update(fs.readFileSync(absolutePath));
    hash.update('\0');
  }

  return hash.digest('hex');
}

function walkDirectory(
  rootDir: string,
  currentDir: string,
  exclude: ReadonlySet<string>,
  files: string[]
): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (exclude.has(entry.name) || entry.name.startsWith('._')) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(rootDir, absolutePath, exclude, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(path.relative(rootDir, absolutePath).split(path.sep).join('/'));
    }
  }
}

export function hasDistArtifacts(packageDir: string): boolean {
  const distDir = path.join(packageDir, 'dist');
  if (!fs.existsSync(distDir)) {
    return false;
  }

  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  return entries.some((entry) => entry.isFile() && !entry.name.startsWith('._'));
}

export function resolveExcludeSet(customExclude?: readonly string[]): Set<string> {
  return new Set([...DEFAULT_EXCLUDES, ...(customExclude ?? [])]);
}
