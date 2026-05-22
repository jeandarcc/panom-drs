import fs from 'node:fs';
import path from 'node:path';
import type { DrsConfig } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import { findConsumerByDir, resolveVendoringDir } from './paths.js';
import { getVendoringPlan, type VendoredSourcePackage } from './plan.js';
import { readVendorStamp } from './stamp.js';
import { resolveSyncExcludeSet, syncDirectoryIncremental, type IncrementalSyncResult } from './manifest.js';

export interface VendoredSyncResult {
  packages: string[];
  copied: string[];
  removed: string[];
  skipped: string[];
}

export function syncVendoredModules(config: DrsConfig, consumerCwd: string): VendoredSyncResult {
  const plan = getVendoringPlan(config, consumerCwd);
  const root = resolveRoot(config);
  const { consumerDir } = findConsumerByDir(config, consumerCwd);
  const vendoringDir = resolveVendoringDir(config);
  const generatedRoot = path.join(consumerDir, vendoringDir);
  const exclude = resolveSyncExcludeSet(config.vendoring?.exclude);
  const stamp = readVendorStamp(consumerDir);

  fs.mkdirSync(generatedRoot, { recursive: true });
  removeUnplannedPackages(consumerDir, plan.sourcePackages, stamp);

  const copied: string[] = [];
  const removed: string[] = [];
  const skipped: string[] = [];
  const packages: string[] = [];

  for (const sourcePackage of plan.sourcePackages) {
    const absoluteSourcePath = path.resolve(root, sourcePackage.sourcePath);
    const absoluteGeneratedPath = path.join(consumerDir, sourcePackage.generatedPath);
    fs.mkdirSync(path.dirname(absoluteGeneratedPath), { recursive: true });

    const result = syncDirectoryIncremental(absoluteSourcePath, absoluteGeneratedPath, exclude);
    seedGeneratedPackageJson(absoluteSourcePath, absoluteGeneratedPath);
    packages.push(sourcePackage.name);
    copied.push(...result.copied.map((file) => `${sourcePackage.name}:${file}`));
    removed.push(...result.removed.map((file) => `${sourcePackage.name}:${file}`));
    skipped.push(...result.skipped.map((file) => `${sourcePackage.name}:${file}`));

    pruneGeneratedNoise(absoluteGeneratedPath);
  }

  const generatedPackages = new Map(plan.sourcePackages.map((pkg) => [pkg.name, pkg]));
  for (const sourcePackage of plan.sourcePackages) {
    rewriteGeneratedPackageManifest(
      path.join(consumerDir, sourcePackage.generatedPath),
      generatedPackages,
      vendoringDir
    );
  }

  return { packages, copied, removed, skipped };
}

function seedGeneratedPackageJson(sourceDir: string, generatedDir: string): void {
  const sourcePackageJson = path.join(sourceDir, 'package.json');
  const generatedPackageJson = path.join(generatedDir, 'package.json');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.copyFileSync(sourcePackageJson, generatedPackageJson);
}

function removeUnplannedPackages(
  consumerDir: string,
  plannedPackages: VendoredSourcePackage[],
  stamp: ReturnType<typeof readVendorStamp>
): void {
  if (!stamp) {
    return;
  }

  const plannedNames = new Set(plannedPackages.map((pkg) => pkg.name));
  for (const [name, entry] of Object.entries(stamp.packages)) {
    if (plannedNames.has(name)) {
      continue;
    }
    const generatedDir = path.join(consumerDir, entry.generatedPath);
    if (fs.existsSync(generatedDir)) {
      fs.rmSync(generatedDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
}

function pruneGeneratedNoise(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.name.startsWith('._') || entry.name === '.DS_Store') {
      fs.rmSync(target, { recursive: true, force: true });
      continue;
    }
    if (entry.isDirectory()) {
      pruneGeneratedNoise(target);
    }
  }
}

function rewriteGeneratedPackageManifest(
  generatedPackageDir: string,
  generatedPackages: ReadonlyMap<string, VendoredSourcePackage>,
  vendoringDir: string
): void {
  const packageJsonPath = path.join(generatedPackageDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<
    string,
    unknown
  > & {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };

  rewriteDependencyBlock(packageJson.dependencies, generatedPackageDir, generatedPackages, vendoringDir);
  rewriteDependencyBlock(packageJson.devDependencies, generatedPackageDir, generatedPackages, vendoringDir);
  rewriteDependencyBlock(packageJson.peerDependencies, generatedPackageDir, generatedPackages, vendoringDir);
  rewriteDependencyBlock(packageJson.optionalDependencies, generatedPackageDir, generatedPackages, vendoringDir);

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  fs.rmSync(path.join(generatedPackageDir, 'package-lock.json'), { force: true });
}

function rewriteDependencyBlock(
  dependencies: Record<string, string> | undefined,
  generatedPackageDir: string,
  generatedPackages: ReadonlyMap<string, VendoredSourcePackage>,
  vendoringDir: string
): void {
  if (!dependencies) return;

  const generatedModulesMarker = `${path.sep}${vendoringDir}${path.sep}`;
  const markerIndex = generatedPackageDir.indexOf(generatedModulesMarker);
  const consumerRoot =
    markerIndex >= 0 ? generatedPackageDir.slice(0, markerIndex) : path.dirname(generatedPackageDir);

  for (const dependencyName of Object.keys(dependencies)) {
    const generatedDependency = generatedPackages.get(dependencyName);
    if (!generatedDependency) continue;
    const targetDir = path.join(consumerRoot, generatedDependency.generatedPath);
    dependencies[dependencyName] = `file:${path.relative(generatedPackageDir, targetDir) || '.'}`;
  }
}

export type { IncrementalSyncResult };
