import fs from 'node:fs';
import path from 'node:path';
import type { DrsConfig, DrsMode, PackageEntry } from '../config/schema.js';
import { resolveModeFromEnv, resolveRoot } from '../config/load.js';
import { isCiEnvironment } from './env.js';

export function effectiveMode(
  config: DrsConfig,
  packageName: string,
  optionsMode?: DrsMode
): DrsMode {
  const perPackage = resolveModeFromEnv(packageName, config.defaults.mode);
  if (perPackage) return perPackage;
  if (optionsMode) return optionsMode;
  const global = resolveModeFromEnv(null, config.defaults.mode);
  if (global) return global;
  return config.defaults.mode;
}

export function resolveSourceForPackage(
  config: DrsConfig,
  packageName: string,
  entry: PackageEntry,
  mode: DrsMode
): 'local' | 'registry' {
  const root = resolveRoot(config);
  const localAbs = path.resolve(root, entry.local.path);
  const localExists = fs.existsSync(localAbs);
  const forceLocal = entry.local['only-source'] === true;

  if (forceLocal) {
    if (!localExists) {
      throw new Error(
        `DRS package "${packageName}" is marked only-source but local path is missing: ${localAbs}.`
      );
    }
    return 'local';
  }

  switch (mode) {
    case 'local':
      if (!localExists) {
        throw new Error(
          `DRS mode=local but local path missing for ${packageName}: ${localAbs}. ` +
            `Checkout the monorepo or set DRS_MODE=registry.`
        );
      }
      return 'local';
    case 'registry':
      return 'registry';
    case 'auto':
      if (isCiEnvironment()) {
        return 'registry';
      }
      return localExists ? 'local' : 'registry';
    default:
      return localExists ? 'local' : 'registry';
  }
}
