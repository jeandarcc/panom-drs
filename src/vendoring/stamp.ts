import fs from 'node:fs';
import path from 'node:path';
import type { DrsConfig } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import { findConsumerByDir } from './paths.js';
import { getVendoringPlan, type VendoredSourcePackage } from './plan.js';
import { hashDirectory, hasDistArtifacts, resolveExcludeSet } from './fingerprint.js';

export const VENDOR_STAMP_FILE = '.drs-vendor-stamp.json';

export interface VendorStampEntry {
  sourcePath: string;
  generatedPath: string;
  sourceHash: string;
  generatedHash: string;
  distRequired: boolean;
  distPresent: boolean;
}

export interface VendorStampFile {
  version: 1;
  updatedAt: string;
  packages: Record<string, VendorStampEntry>;
}

export interface VendorPackageSnapshot {
  name: string;
  sourcePath: string;
  generatedPath: string;
  sourceHash: string | null;
  generatedHash: string | null;
  distRequired: boolean;
  distPresent: boolean;
}

export function vendorStampPath(consumerDir: string): string {
  return path.join(consumerDir, VENDOR_STAMP_FILE);
}

export function readVendorStamp(consumerDir: string): VendorStampFile | null {
  const stampPath = vendorStampPath(consumerDir);
  if (!fs.existsSync(stampPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(stampPath, 'utf8')) as VendorStampFile;
}

export function writeVendorStamp(consumerDir: string, stamp: VendorStampFile): void {
  fs.writeFileSync(vendorStampPath(consumerDir), `${JSON.stringify(stamp, null, 2)}\n`, 'utf8');
}

export function snapshotVendoredPackages(
  config: DrsConfig,
  consumerCwd: string
): VendorPackageSnapshot[] {
  const plan = getVendoringPlan(config, consumerCwd);
  const root = resolveRoot(config);
  const { consumerDir } = findConsumerByDir(config, consumerCwd);
  const exclude = resolveExcludeSet(config.vendoring?.exclude);

  return plan.sourcePackages.map((sourcePackage) =>
    snapshotVendoredPackage(config, root, consumerDir, sourcePackage, exclude)
  );
}

function snapshotVendoredPackage(
  _config: DrsConfig,
  root: string,
  consumerDir: string,
  sourcePackage: VendoredSourcePackage,
  exclude: ReadonlySet<string>
): VendorPackageSnapshot {
  const sourceDir = path.resolve(root, sourcePackage.sourcePath);
  const generatedDir = path.join(consumerDir, sourcePackage.generatedPath);
  const distRequired = !sourcePackage.prebuilt && Boolean(sourcePackage.buildCommand);

  return {
    name: sourcePackage.name,
    sourcePath: sourcePackage.sourcePath,
    generatedPath: sourcePackage.generatedPath,
    sourceHash: hashDirectory(sourceDir, exclude),
    generatedHash: hashDirectory(generatedDir, exclude),
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
      sourceHash: snapshot.sourceHash ?? '',
      generatedHash: snapshot.generatedHash ?? '',
      distRequired: snapshot.distRequired,
      distPresent: snapshot.distPresent,
    };
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    packages,
  };
}

export function writeVendorStampForConsumer(config: DrsConfig, consumerCwd: string): void {
  const { consumerDir } = findConsumerByDir(config, consumerCwd);
  writeVendorStamp(consumerDir, createVendorStamp(config, consumerCwd));
}
