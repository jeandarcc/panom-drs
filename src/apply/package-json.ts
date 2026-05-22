import fs from 'node:fs';
import path from 'node:path';
import type { ResolutionPlan, ResolvedEntry } from '../resolve/plan.js';
import { normalizeForCompare } from '../resolve/paths.js';

export interface PackageJsonChange {
  consumerId: string;
  packageJsonPath: string;
  name: string;
  from: string | undefined;
  to: string;
  changed: boolean;
}

export interface ApplyResult {
  dryRun: boolean;
  changes: PackageJsonChange[];
  wroteFiles: string[];
}

function readPackageJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function createScaffoldPackageJson(consumerId: string): Record<string, unknown> {
  return {
    name: `@panom/drs-${consumerId}`,
    private: true,
    version: '0.0.0',
    dependencies: {},
  };
}

function groupByConsumer(entries: ResolvedEntry[]): Map<string, ResolvedEntry[]> {
  const map = new Map<string, ResolvedEntry[]>();
  for (const e of entries) {
    const list = map.get(e.consumerId) ?? [];
    list.push(e);
    map.set(e.consumerId, list);
  }
  return map;
}

export function applyPackageJson(
  plan: ResolutionPlan,
  options: { dryRun?: boolean } = {}
): ApplyResult {
  const dryRun = options.dryRun ?? false;
  const changes: PackageJsonChange[] = [];
  const wroteFiles: string[] = [];
  const byConsumer = groupByConsumer(plan.entries);

  for (const [consumerId, consumerEntries] of byConsumer) {
    const packageJsonPath = path.join(consumerEntries[0]!.consumerDir, 'package.json');
    let pkg: Record<string, unknown>;
    let scaffolded = false;

    if (!fs.existsSync(packageJsonPath)) {
      pkg = createScaffoldPackageJson(consumerId);
      scaffolded = true;
      if (!dryRun) {
        fs.mkdirSync(path.dirname(packageJsonPath), { recursive: true });
      }
    } else {
      pkg = readPackageJson(packageJsonPath);
    }
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    let mutated = false;

    for (const entry of consumerEntries) {
      const from = deps[entry.name];
      const same =
        from !== undefined &&
        normalizeForCompare(from) === normalizeForCompare(entry.specifier);

      changes.push({
        consumerId,
        packageJsonPath,
        name: entry.name,
        from,
        to: entry.specifier,
        changed: !same,
      });

      if (!same) {
        deps[entry.name] = entry.specifier;
        mutated = true;
      }
    }

    if ((mutated || scaffolded) && !dryRun) {
      pkg.dependencies = deps;
      fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
      wroteFiles.push(packageJsonPath);
    }
  }

  return { dryRun, changes, wroteFiles };
}
