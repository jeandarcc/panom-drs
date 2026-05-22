import path from 'node:path';
import type { DrsConfig } from '../config/schema.js';
import type { ResolutionPlan } from '../resolve/plan.js';
import { syncVendoredModules } from '../vendoring/sync.js';
import {
  buildSourcePackagesForVendoring,
  buildVendoredModules,
  copyVendoredDistArtifacts,
} from '../vendoring/build.js';
import { writeVendorStampForConsumer } from '../vendoring/stamp.js';
import { resolveLog, type DrsProgressOptions } from '../log.js';

export interface VendoringApplyResult {
  synced: string[];
  built: string[];
  skipped: string[];
  errors: string[];
}

export function listVendoredConsumerDirs(plan: ResolutionPlan): string[] {
  const dirs = new Set<string>();
  for (const entry of plan.entries) {
    if (entry.layout === 'vendored' && entry.source === 'local') {
      dirs.add(entry.consumerDir);
    }
  }
  return [...dirs];
}

export function runVendoring(
  config: DrsConfig,
  plan: ResolutionPlan,
  options: DrsProgressOptions & { verbose?: boolean } = {}
): VendoringApplyResult {
  const synced: string[] = [];
  const built: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const log = resolveLog(options);

  for (const consumerDir of listVendoredConsumerDirs(plan)) {
    const label = path.relative(plan.root, consumerDir) || consumerDir;
    try {
      log.progress(`[${label}] building source packages…`);
      const sourceBuild = buildSourcePackagesForVendoring(config, consumerDir, options);
      built.push(...sourceBuild.built.map((p) => `${label}:${p}`));
      skipped.push(...sourceBuild.skipped.map((p) => `${label}:${p}`));
      errors.push(...sourceBuild.errors);

      log.progress(`[${label}] syncing generated_modules…`);
      syncVendoredModules(config, consumerDir);
      synced.push(label);

      log.progress(`[${label}] copying dist artifacts…`);
      const copied = copyVendoredDistArtifacts(config, consumerDir);
      if (copied.length > 0) {
        skipped.push(...copied.map((p) => `${label}:dist:${p}`));
      }

      log.progress(`[${label}] installing and validating vendored packages…`);
      const buildResult = buildVendoredModules(config, consumerDir, options);
      built.push(...buildResult.built.map((p) => `${label}:${p}`));
      skipped.push(...buildResult.skipped.map((p) => `${label}:${p}`));
      errors.push(...buildResult.errors);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`DRS vendoring failed:\n${errors.join('\n')}`);
  }

  for (const consumerDir of listVendoredConsumerDirs(plan)) {
    writeVendorStampForConsumer(config, consumerDir);
  }

  return { synced, built, skipped, errors };
}
