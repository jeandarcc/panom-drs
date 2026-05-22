import fs from 'node:fs';
import path from 'node:path';
import type { DrsConfig } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import { findConsumerByDir } from './paths.js';
import { getVendoringPlan, type VendoredSourcePackage } from './plan.js';
import { hashPackageManifest, hasDistArtifacts } from './fingerprint.js';
import { requiresDistArtifact } from './build-commands.js';
import {
  aggregateManifestHash,
  collectFileManifest,
  resolveSyncExcludeSet,
  type VendoredFileManifest,
} from './manifest.js';

export const VENDOR_STAMP_FILE = '.drs-vendor-stamp.json';

export interface VendorStampEntry {
  sourcePath: string;
  generatedPath: string;
  contentHash: string;
  packageJsonHash: string;
  distRequired: boolean;
  distPresent: boolean;
  files: VendoredFileManifest;
}

export interface VendorStampFile {
  version: 2;
  updatedAt: string;
  packages: Record<string, VendorStampEntry>;
}

export interface VendorPackageSnapshot {
  name: string;
  sourcePath: string;
  generatedPath: string;
  contentHash: string | null;
  generatedContentHash: string | null;
  packageJsonHash: string | null;
  sourceFiles: VendoredFileManifest | null;
  generatedFiles: VendoredFileManifest | null;
  distRequired: boolean;
  distPresent: boolean;
}

export function vendorStampPath(consumerDir: string): string {
  return path.join(consumerDir, VENDOR_STAMP_FILE);
}

interface LegacyVendorStampFile {
  version: 1;
  updatedAt: string;
  packages: Record<
    string,
    Omit<VendorStampEntry, 'files'> & {
      files?: VendoredFileManifest;
    }
  >;
}

export function readVendorStamp(consumerDir: string): VendorStampFile | null {
  const stampPath = vendorStampPath(consumerDir);
  if (!fs.existsSync(stampPath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(stampPath, 'utf8')) as LegacyVendorStampFile | VendorStampFile;
  if (raw.version !== 1 && raw.version !== 2) {
    return null;
  }

  const packages: Record<string, VendorStampEntry> = {};
  for (const [name, entry] of Object.entries(raw.packages)) {
    packages[name] = {
      ...entry,
      files: entry.files ?? {},
    };
  }

  return {
    version: 2,
    updatedAt: raw.updatedAt,
    packages,
  };
}

export function writeVendorStamp(consumerDir: string, stamp: VendorStampFile): void {
  fs.writeFileSync(vendorStampPath(consumerDir), `${JSON.stringify(stamp, null, 2)}\n`, 'utf8');
}

export interface SnapshotVendoredOptions {
  onPackage?: (name: string) => void;
}

export function snapshotVendoredPackages(
  config: DrsConfig,
  consumerCwd: string,
  options: SnapshotVendoredOptions = {}
): VendorPackageSnapshot[] {
  const plan = getVendoringPlan(config, consumerCwd);
  const root = resolveRoot(config);
  const { consumerDir } = findConsumerByDir(config, consumerCwd);
  const exclude = resolveSyncExcludeSet(config.vendoring?.exclude);
  const stamp = readVendorStamp(consumerDir);

  return plan.sourcePackages.map((sourcePackage) => {
    options.onPackage?.(sourcePackage.name);
    return snapshotVendoredPackage(
      root,
      consumerDir,
      sourcePackage,
      exclude,
      stamp?.packages[sourcePackage.name]?.files
    );
  });
}

function snapshotVendoredPackage(
  root: string,
  consumerDir: string,
  sourcePackage: VendoredSourcePackage,
  exclude: ReadonlySet<string>,
  stampedFiles?: VendoredFileManifest
): VendorPackageSnapshot {
  const sourceDir = path.resolve(root, sourcePackage.sourcePath);
  const generatedDir = path.join(consumerDir, sourcePackage.generatedPath);
  const distRequired = requiresDistArtifact(sourcePackage.buildCommand);
  const sourceFiles = collectFileManifest(sourceDir, exclude, stampedFiles);
  const generatedFiles = collectFileManifest(generatedDir, exclude, stampedFiles);

  return {
    name: sourcePackage.name,
    sourcePath: sourcePackage.sourcePath,
    generatedPath: sourcePackage.generatedPath,
    contentHash: sourceFiles ? aggregateManifestHash(sourceFiles) : null,
    generatedContentHash: generatedFiles ? aggregateManifestHash(generatedFiles) : null,
    packageJsonHash: hashPackageManifest(sourceDir),
    sourceFiles,
    generatedFiles,
    distRequired,
    distPresent: !distRequired || hasDistArtifacts(generatedDir),
  };
}

export function createVendorStamp(
  config: DrsConfig,
  consumerCwd: string
): VendorStampFile {
  const snapshots = snapshotVendoredPackages(config, consumerCwd);
  const packages: Record<string, VendorStampEntry> = {};

  for (const snapshot of snapshots) {
    packages[snapshot.name] = {
      sourcePath: snapshot.sourcePath,
      generatedPath: snapshot.generatedPath,
      contentHash: snapshot.contentHash ?? '',
      packageJsonHash: snapshot.packageJsonHash ?? '',
      distRequired: snapshot.distRequired,
      distPresent: snapshot.distPresent,
      files: snapshot.sourceFiles ?? {},
    };
  }

  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    packages,
  };
}

export function writeVendorStampForConsumer(config: DrsConfig, consumerCwd: string): void {
  const { consumerDir } = findConsumerByDir(config, consumerCwd);
  writeVendorStamp(consumerDir, createVendorStamp(config, consumerCwd));
}
