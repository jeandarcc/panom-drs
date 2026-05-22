import path from 'node:path';
import type { DrsConfig, DrsLayout } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';

export function resolveConsumerSlug(config: DrsConfig, consumerDir: string): string {
  const root = resolveRoot(config);
  return path.relative(root, path.resolve(consumerDir)).split(path.sep).join('/') || '.';
}

export function resolveConsumerLayout(config: DrsConfig, consumerId: string): DrsLayout {
  const consumer = config.consumers[consumerId];
  if (!consumer) {
    throw new Error(`Unknown consumer "${consumerId}".`);
  }
  return consumer.layout ?? config.defaults.layout;
}

export function resolveVendoringDir(config: DrsConfig): string {
  return config.vendoring?.dir ?? 'generated_modules';
}

export function resolveGeneratedModulePath(vendoringDir: string, localPath: string): string {
  const normalized = localPath.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '');
  if (normalized === '' || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`DRS local.path must stay inside the repository root: ${localPath}`);
  }
  return path.posix.join(vendoringDir, normalized);
}

export function findConsumerByDir(config: DrsConfig, consumerCwd: string): {
  consumerId: string;
  consumerDir: string;
  consumerSlug: string;
} {
  const root = resolveRoot(config);
  const normalizedConsumerPath = path.resolve(consumerCwd);

  for (const [consumerId, consumer] of Object.entries(config.consumers)) {
    const consumerPath = path.resolve(root, consumer.dir);
    if (consumerPath === normalizedConsumerPath) {
      return {
        consumerId,
        consumerDir: consumerPath,
        consumerSlug: path.relative(root, consumerPath).split(path.sep).join('/') || '.',
      };
    }
  }

  throw new Error(`No DRS consumer matches directory: ${consumerCwd}`);
}

export function getPackageEntry(config: DrsConfig, packageName: string) {
  const entry = config.packages[packageName];
  if (!entry) {
    throw new Error(`DRS package "${packageName}" is not defined in config.`);
  }
  return entry;
}
