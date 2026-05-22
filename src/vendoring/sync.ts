import fs from 'node:fs';
import path from 'node:path';
import type { DrsConfig } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import { findConsumerByDir, resolveVendoringDir } from './paths.js';
import { getVendoringPlan, type VendoredSourcePackage } from './plan.js';

function shouldCopyEntry(source: string, exclude: ReadonlySet<string>): boolean {
  const entryName = path.basename(source);
  return !exclude.has(entryName) && !entryName.startsWith('._');
}

export function syncVendoredModules(config: DrsConfig, consumerCwd: string): void {
  const plan = getVendoringPlan(config, consumerCwd);
  const root = resolveRoot(config);
  const { consumerDir } = findConsumerByDir(config, consumerCwd);
  const vendoringDir = resolveVendoringDir(config);
  const generatedRoot = path.join(consumerDir, vendoringDir);
  const exclude = new Set(config.vendoring?.exclude ?? []);

  fs.rmSync(generatedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(generatedRoot, { recursive: true });

  for (const sourcePackage of plan.sourcePackages) {
    const absoluteSourcePath = path.resolve(root, sourcePackage.sourcePath);
    const absoluteGeneratedPath = path.join(consumerDir, sourcePackage.generatedPath);
    fs.mkdirSync(path.dirname(absoluteGeneratedPath), { recursive: true });
    fs.cpSync(absoluteSourcePath, absoluteGeneratedPath, {
      recursive: true,
      filter: (source) => shouldCopyEntry(source, exclude),
    });
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
