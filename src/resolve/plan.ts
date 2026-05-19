import path from 'node:path';
import type { DrsConfig, DrsMode } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import { effectiveMode, resolveSourceForPackage } from './modes.js';
import { toFileSpecifier } from './paths.js';
import { getDockerHints } from '../docker/hints.js';

export interface ResolvedEntry {
  name: string;
  consumerId: string;
  consumerDir: string;
  source: 'local' | 'registry';
  specifier: string;
  localPath?: string;
  buildCommand?: string;
}

export interface DockerHint {
  serviceId: string;
  context: string;
  dockerfile: string;
}

export interface ResolutionPlan {
  mode: DrsMode;
  root: string;
  entries: ResolvedEntry[];
  docker?: DockerHint[];
}

export interface ResolveOptions {
  mode?: DrsMode;
  env?: Record<string, string>;
}

export function resolve(config: DrsConfig, options: ResolveOptions = {}): ResolutionPlan {
  if (options.env) {
    for (const [k, v] of Object.entries(options.env)) {
      process.env[k] = v;
    }
  }

  const root = resolveRoot(config);
  const entries: ResolvedEntry[] = [];
  let planMode = options.mode ?? config.defaults.mode;

  for (const [consumerId, consumer] of Object.entries(config.consumers)) {
    const consumerDir = path.resolve(root, consumer.dir);

    for (const depName of consumer.dependencies) {
      const pkgEntry = config.packages[depName];
      if (!pkgEntry) {
        throw new Error(
          `Package "${depName}" listed in consumer "${consumerId}" but not defined in packages.`
        );
      }

      const mode = effectiveMode(config, depName, options.mode);
      const source = resolveSourceForPackage(config, depName, pkgEntry, mode);
      const localAbs = path.resolve(root, pkgEntry.local.path);

      let specifier: string;
      if (source === 'local') {
        specifier = toFileSpecifier(consumerDir, localAbs);
      } else {
        specifier = pkgEntry.registry.version;
      }

      entries.push({
        name: depName,
        consumerId,
        consumerDir,
        source,
        specifier,
        localPath: source === 'local' ? pkgEntry.local.path : undefined,
        buildCommand: source === 'local' ? pkgEntry.local.build : undefined,
      });

      if (!options.mode) {
        planMode = mode;
      }
    }
  }

  return {
    mode: planMode,
    root,
    entries,
    docker: getDockerHints(config, entries),
  };
}
