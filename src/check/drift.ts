import fs from 'node:fs';
import path from 'node:path';
import type { DrsConfig } from '../config/schema.js';
import { resolve } from '../resolve/plan.js';
import type { ResolveOptions } from '../resolve/plan.js';
import { normalizeForCompare } from '../resolve/paths.js';
import { checkVendoredDrift, type VendoredDriftItem } from './vendored.js';

export interface DriftItem {
  consumerId: string;
  packageJsonPath: string;
  name: string;
  expected: string;
  actual: string | undefined;
}

export interface CheckResult {
  ok: boolean;
  drift: DriftItem[];
  vendoredDrift: VendoredDriftItem[];
  planMode: string;
}

function checkPackageJsonDrift(config: DrsConfig, options: ResolveOptions = {}): DriftItem[] {
  const plan = resolve(config, options);
  const drift: DriftItem[] = [];

  for (const entry of plan.entries) {
    const packageJsonPath = path.join(entry.consumerDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const actual = pkg.dependencies?.[entry.name];
    const expectedNorm = normalizeForCompare(entry.specifier);
    const actualNorm = actual ? normalizeForCompare(actual) : undefined;

    if (actualNorm !== expectedNorm) {
      drift.push({
        consumerId: entry.consumerId,
        packageJsonPath,
        name: entry.name,
        expected: entry.specifier,
        actual,
      });
    }
  }

  return drift;
}

export function check(config: DrsConfig, options: ResolveOptions = {}): CheckResult {
  const plan = resolve(config, options);
  const drift = checkPackageJsonDrift(config, options);
  const vendoredDrift = checkVendoredDrift(config, options);

  return {
    ok: drift.length === 0 && vendoredDrift.length === 0,
    drift,
    vendoredDrift,
    planMode: plan.mode,
  };
}

export function isStale(config: DrsConfig, options: ResolveOptions = {}): boolean {
  return !check(config, options).ok;
}
