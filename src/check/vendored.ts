import path from 'node:path';
import type { DrsConfig } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import { listVendoredConsumerDirs } from '../vendoring/run.js';
import { resolve } from '../resolve/plan.js';
import type { ResolveOptions } from '../resolve/plan.js';
import { snapshotVendoredPackages } from '../vendoring/stamp.js';

export type VendoredDriftReason =
  | 'missing-generated'
  | 'source-changed'
  | 'generated-stale'
  | 'dist-missing';

export interface VendoredDriftItem {
  consumerId: string;
  name: string;
  reason: VendoredDriftReason;
  detail: string;
}

export function checkVendoredDrift(
  config: DrsConfig,
  options: ResolveOptions = {}
): VendoredDriftItem[] {
  const plan = resolve(config, options);
  const drift: VendoredDriftItem[] = [];
  const root = resolveRoot(config);

  for (const consumerDir of listVendoredConsumerDirs(plan)) {
    const consumerId =
      Object.entries(config.consumers).find(
        ([, consumer]) => path.resolve(root, consumer.dir) === consumerDir
      )?.[0] ?? path.relative(root, consumerDir);

    const snapshots = snapshotVendoredPackages(config, consumerDir);

    for (const snapshot of snapshots) {
      if (!snapshot.sourceHash) {
        drift.push({
          consumerId,
          name: snapshot.name,
          reason: 'source-changed',
          detail: `source path missing: ${snapshot.sourcePath}`,
        });
        continue;
      }

      if (!snapshot.generatedHash) {
        drift.push({
          consumerId,
          name: snapshot.name,
          reason: 'missing-generated',
          detail: snapshot.generatedPath,
        });
        continue;
      }

      if (snapshot.sourceHash !== snapshot.generatedHash) {
        drift.push({
          consumerId,
          name: snapshot.name,
          reason: 'generated-stale',
          detail: `${snapshot.sourcePath} → ${snapshot.generatedPath}`,
        });
        continue;
      }

      if (snapshot.distRequired && !snapshot.distPresent) {
        drift.push({
          consumerId,
          name: snapshot.name,
          reason: 'dist-missing',
          detail: path.join(snapshot.generatedPath, 'dist'),
        });
      }
    }
  }

  return drift;
}
