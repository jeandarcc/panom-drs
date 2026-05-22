import fs from 'node:fs';
import path from 'node:path';
import type { DrsConfig, PackageEntry } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import {
  findConsumerByDir,
  resolveGeneratedModulePath,
  resolveVendoringDir,
} from './paths.js';

export interface VendoredSourcePackage {
  name: string;
  sourcePath: string;
  generatedPath: string;
  installSpecifier: string;
  buildCommand?: string;
  prebuilt?: boolean;
  dependencyNames: string[];
}

export interface VendoringPlan {
  consumerId: string;
  consumerPath: string;
  consumerSlug: string;
  installSpecifiers: string[];
  installCommand: string;
  sourcePackages: VendoredSourcePackage[];
}

interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export function formatNpmInstallCommand(specifiers: readonly string[]): string {
  return specifiers.length > 0 ? `npm install ${specifiers.join(' ')}` : 'npm install';
}

export function packageUsesSourceForConsumer(
  entry: PackageEntry,
  consumerSlug: string
): boolean {
  const sourceTargets = entry.to ?? [];
  return sourceTargets.length === 0 || sourceTargets.includes(consumerSlug);
}

export function getVendoringPlan(config: DrsConfig, consumerCwd: string): VendoringPlan {
  const root = resolveRoot(config);
  const { consumerId, consumerDir, consumerSlug } = findConsumerByDir(config, consumerCwd);
  const consumer = config.consumers[consumerId]!;
  const vendoringDir = resolveVendoringDir(config);

  const installSpecifiers: string[] = [];
  const sourcePackages: VendoredSourcePackage[] = [];
  const sourcePackageNames = new Set<string>();

  for (const packageName of consumer.dependencies) {
    const packageEntry = config.packages[packageName];
    if (!packageEntry) {
      throw new Error(`DRS consumer "${consumerId}" depends on unknown package "${packageName}".`);
    }

    const absoluteLocalPath = path.resolve(root, packageEntry.local.path);
    const sourceForConsumer = packageUsesSourceForConsumer(packageEntry, consumerSlug);

    if (!sourceForConsumer) {
      installSpecifiers.push(`${packageName}@${packageEntry.registry.version}`);
      continue;
    }

    if (!fs.existsSync(absoluteLocalPath)) {
      throw new Error(
        `DRS package "${packageName}" requires local source but path is missing: ${absoluteLocalPath}.`
      );
    }

    const generatedPath = resolveGeneratedModulePath(vendoringDir, packageEntry.local.path);
    sourcePackageNames.add(packageName);
    sourcePackages.push({
      name: packageName,
      sourcePath: path.relative(root, absoluteLocalPath) || '.',
      generatedPath,
      installSpecifier: `file:./${generatedPath}`,
      ...(packageEntry.local.build !== undefined ? { buildCommand: packageEntry.local.build } : {}),
      ...(packageEntry.prebuilt ? { prebuilt: true } : {}),
      dependencyNames: [],
    });
  }

  for (let index = 0; index < sourcePackages.length; index += 1) {
    const sourcePackage = sourcePackages[index]!;
    const packageJson = readPackageJson(path.resolve(root, sourcePackage.sourcePath), sourcePackage.name);
    sourcePackages[index] = {
      ...sourcePackage,
      dependencyNames: listDrsDependencies(packageJson, sourcePackageNames),
    };
  }

  const orderedSourcePackages = sortSourcePackages(sourcePackages);
  const allSpecifiers = [...installSpecifiers, ...orderedSourcePackages.map((pkg) => pkg.installSpecifier)];

  return {
    consumerId,
    consumerPath: path.relative(root, consumerDir) || '.',
    consumerSlug,
    installSpecifiers: allSpecifiers,
    installCommand: formatNpmInstallCommand(allSpecifiers),
    sourcePackages: orderedSourcePackages,
  };
}

function readPackageJson(packageDir: string, packageName: string): PackageJsonLike {
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`DRS package "${packageName}" is missing package.json at ${packageJsonPath}.`);
  }
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJsonLike;
}

function listDrsDependencies(
  packageJson: PackageJsonLike,
  sourcePackageNames: ReadonlySet<string>
): string[] {
  const names = new Set<string>();
  for (const block of [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
  ]) {
    for (const dependencyName of Object.keys(block ?? {})) {
      if (sourcePackageNames.has(dependencyName)) {
        names.add(dependencyName);
      }
    }
  }
  return [...names];
}

function sortSourcePackages(sourcePackages: readonly VendoredSourcePackage[]): VendoredSourcePackage[] {
  const byName = new Map(sourcePackages.map((pkg) => [pkg.name, pkg]));
  const remainingDependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const sourcePackage of sourcePackages) {
    const dependencies = new Set(sourcePackage.dependencyNames.filter((name) => byName.has(name)));
    remainingDependencies.set(sourcePackage.name, dependencies);
    for (const dependencyName of dependencies) {
      const nextDependents = dependents.get(dependencyName) ?? new Set<string>();
      nextDependents.add(sourcePackage.name);
      dependents.set(dependencyName, nextDependents);
    }
  }

  const ready = sourcePackages
    .filter((pkg) => (remainingDependencies.get(pkg.name)?.size ?? 0) === 0)
    .map((pkg) => pkg.name);
  const ordered: VendoredSourcePackage[] = [];

  while (ready.length > 0) {
    const nextName = ready.shift()!;
    ordered.push(byName.get(nextName)!);
    for (const dependentName of dependents.get(nextName) ?? []) {
      const dependencySet = remainingDependencies.get(dependentName);
      if (!dependencySet) continue;
      dependencySet.delete(nextName);
      if (dependencySet.size === 0) {
        ready.push(dependentName);
      }
    }
  }

  if (ordered.length !== sourcePackages.length) {
    const unresolved = sourcePackages
      .filter((pkg) => !ordered.some((candidate) => candidate.name === pkg.name))
      .map((pkg) => pkg.name)
      .join(', ');
    throw new Error(`DRS source packages contain a dependency cycle: ${unresolved}`);
  }

  return ordered;
}
