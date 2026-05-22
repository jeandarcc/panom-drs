import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface VendoredFileEntry {
  size: number;
  mtimeMs: number;
  hash: string;
}

export type VendoredFileManifest = Record<string, VendoredFileEntry>;

const DEFAULT_EXCLUDES = new Set([
  '.git',
  'node_modules',
  'dist',
  '.turbo',
  '.next',
  '.DS_Store',
  '.drs-vendor-stamp.json',
]);

/** Payload copied from source — excludes rewritten or separately managed paths. */
export const SYNC_SOURCE_EXCLUDES = new Set([
  ...DEFAULT_EXCLUDES,
  'package-lock.json',
  'package.json',
]);

/** Generated tree scan — keeps rewritten package.json, still excludes dist and lockfiles. */
export const GENERATED_PAYLOAD_EXCLUDES = new Set([
  ...DEFAULT_EXCLUDES,
  'package-lock.json',
  'package.json',
]);

export function resolveSyncExcludeSet(customExclude?: readonly string[]): Set<string> {
  return new Set([...SYNC_SOURCE_EXCLUDES, ...(customExclude ?? [])]);
}

export function hashFileContent(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function walkVendoredFiles(
  rootDir: string,
  exclude: ReadonlySet<string>,
  files: string[] = [],
  currentDir: string = rootDir
): string[] {
  if (!fs.existsSync(currentDir)) {
    return files;
  }

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (exclude.has(entry.name) || entry.name.startsWith('._')) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkVendoredFiles(rootDir, exclude, files, absolutePath);
      continue;
    }
    if (entry.isFile()) {
      files.push(path.relative(rootDir, absolutePath).split(path.sep).join('/'));
    }
  }

  return files;
}

export function collectFileManifest(
  rootDir: string,
  exclude: ReadonlySet<string>,
  stampedFiles?: VendoredFileManifest
): VendoredFileManifest | null {
  if (!fs.existsSync(rootDir)) {
    return null;
  }

  const manifest: VendoredFileManifest = {};
  const files = walkVendoredFiles(rootDir, exclude);
  files.sort();

  for (const relativePath of files) {
    const absolutePath = path.join(rootDir, relativePath);
    const stat = fs.statSync(absolutePath);
    const stamped = stampedFiles?.[relativePath];
    const hash =
      stamped && stamped.size === stat.size && stamped.mtimeMs === stat.mtimeMs
        ? stamped.hash
        : hashFileContent(absolutePath);

    manifest[relativePath] = {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      hash,
    };
  }

  return manifest;
}

export function aggregateManifestHash(manifest: VendoredFileManifest): string {
  const hash = crypto.createHash('sha256');
  const keys = Object.keys(manifest).sort();
  for (const key of keys) {
    const entry = manifest[key]!;
    hash.update(key);
    hash.update('\0');
    hash.update(entry.hash);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function manifestsEqual(
  left: VendoredFileManifest | null | undefined,
  right: VendoredFileManifest | null | undefined
): boolean {
  if (!left || !right) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index]!;
    if (key !== rightKeys[index]) {
      return false;
    }
    const leftEntry = left[key]!;
    const rightEntry = right[key]!;
    if (
      leftEntry.size !== rightEntry.size ||
      leftEntry.mtimeMs !== rightEntry.mtimeMs ||
      leftEntry.hash !== rightEntry.hash
    ) {
      return false;
    }
  }

  return true;
}

function filesMatchByStat(sourcePath: string, destPath: string): boolean {
  const sourceStat = fs.statSync(sourcePath);
  const destStat = fs.statSync(destPath);
  return sourceStat.size === destStat.size && sourceStat.mtimeMs === destStat.mtimeMs;
}

export interface IncrementalSyncResult {
  copied: string[];
  removed: string[];
  skipped: string[];
}

export function syncDirectoryIncremental(
  sourceDir: string,
  destDir: string,
  exclude: ReadonlySet<string>
): IncrementalSyncResult {
  const copied: string[] = [];
  const removed: string[] = [];
  const skipped: string[] = [];

  if (!fs.existsSync(sourceDir)) {
    return { copied, removed, skipped };
  }

  const sourceManifest = collectFileManifest(sourceDir, exclude) ?? {};
  fs.mkdirSync(destDir, { recursive: true });

  for (const [relativePath] of Object.entries(sourceManifest)) {
    const sourcePath = path.join(sourceDir, relativePath);
    const destPath = path.join(destDir, relativePath);

    if (fs.existsSync(destPath)) {
      if (filesMatchByStat(sourcePath, destPath)) {
        skipped.push(relativePath);
        continue;
      }
      if (hashFileContent(sourcePath) === hashFileContent(destPath)) {
        skipped.push(relativePath);
        continue;
      }
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(sourcePath, destPath);
    copied.push(relativePath);
  }

  const orphanExclude = new Set([...exclude, 'package.json', 'package-lock.json']);
  const destFiles = walkVendoredFiles(destDir, orphanExclude);
  for (const relativePath of destFiles) {
    if (sourceManifest[relativePath]) {
      continue;
    }
    fs.rmSync(path.join(destDir, relativePath), { force: true });
    removed.push(relativePath);
  }

  pruneEmptyDirectories(destDir);

  return { copied, removed, skipped };
}

export function generatedPayloadMatchesSource(
  generatedDir: string,
  sourceManifest: VendoredFileManifest,
  exclude: ReadonlySet<string> = GENERATED_PAYLOAD_EXCLUDES
): boolean {
  if (!fs.existsSync(generatedDir)) {
    return false;
  }

  for (const [relativePath, sourceEntry] of Object.entries(sourceManifest)) {
    const generatedPath = path.join(generatedDir, relativePath);
    if (!fs.existsSync(generatedPath)) {
      return false;
    }
    if (hashFileContent(generatedPath) !== sourceEntry.hash) {
      return false;
    }
  }

  const generatedFiles = walkVendoredFiles(generatedDir, exclude);
  for (const relativePath of generatedFiles) {
    if (!sourceManifest[relativePath]) {
      return false;
    }
  }

  return true;
}

function pruneEmptyDirectories(rootDir: string): void {
  if (!fs.existsSync(rootDir)) {
    return;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const childDir = path.join(rootDir, entry.name);
    pruneEmptyDirectories(childDir);
    if (fs.readdirSync(childDir).length === 0) {
      fs.rmSync(childDir, { recursive: true, force: true });
    }
  }
}
