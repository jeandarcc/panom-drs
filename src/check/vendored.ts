import fs from 'node:fs';
import path from 'node:path';
import type { DrsConfig } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import { listVendoredConsumerDirs } from '../vendoring/run.js';
import { resolve } from '../resolve/plan.js';
import type { ResolveOptions } from '../resolve/plan.js';
import { readVendorStamp, snapshotVendoredPackages } from '../vendoring/stamp.js';
import { resolveLog, type DrsProgressOptions } from '../log.js';

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

function generatedDirExists(consumerDir: string, generatedPath: string): boolean {
  return fs.existsSync(path.join(consumerDir, generatedPath));
}

export function checkVendoredDrift(
  config: DrsConfig,
  options: ResolveOptions & DrsProgressOptions = {}
): VendoredDriftItem[] {
  const plan = resolve(config, options);
  const drift: VendoredDriftItem[] = [];
  const root = resolveRoot(config);
  const log = resolveLog(options);

  for (const consumerDir of listVendoredConsumerDirs(plan)) {
    const consumerId =
      Object.entries(config.consumers).find(
        ([, consumer]) => path.resolve(root, consumer.dir) === consumerDir
      )?.[0] ?? path.relative(root, consumerDir);

    log.progress(`checking vendored modules for ${consumerId}…`);
    const stamp = readVendorStamp(consumerDir);
    const snapshots = snapshotVendoredPackages(config, consumerDir, {
      onPackage: (name) => log.progress(`  fingerprint ${name}…`),
    });

    for (const snapshot of snapshots) {
      if (!snapshot.contentHash) {
        drift.push({
          consumerId,
          name: snapshot.name,
          reason: 'source-changed',
          detail: `source path missing: ${snapshot.sourcePath}`,
        });
        continue;
      }

      if (!generatedDirExists(consumerDir, snapshot.generatedPath) || !snapshot.generatedContentHash) {
        drift.push({
          consumerId,
          name: snapshot.name,
          reason: 'missing-generated',
          detail: snapshot.generatedPath,
        });
        continue;
      }

      const stamped = stamp?.packages[snapshot.name];
      if (stamped) {
        if (snapshot.contentHash !== stamped.contentHash) {
          drift.push({
            consumerId,
            name: snapshot.name,
            reason: 'source-changed',
            detail: snapshot.sourcePath,
          });
          continue;
        }

        if ((snapshot.packageJsonHash ?? '') !== stamped.packageJsonHash) {
          drift.push({
            consumerId,
            name: snapshot.name,
            reason: 'source-changed',
            detail: `${snapshot.sourcePath}/package.json`,
          });
          continue;
        }

        if (snapshot.generatedContentHash !== stamped.contentHash) {
          drift.push({
            consumerId,
            name: snapshot.name,
            reason: 'generated-stale',
            detail: snapshot.generatedPath,
          });
          continue;
        }
      } else if (snapshot.contentHash !== snapshot.generatedContentHash) {
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
