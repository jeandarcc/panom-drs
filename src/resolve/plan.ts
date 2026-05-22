import path from 'node:path';
import type { DrsConfig, DrsMode } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import { effectiveMode, resolveSourceForPackage } from './modes.js';
import { toFileSpecifier } from './paths.js';
import { getDockerHints } from '../docker/hints.js';
import {
  resolveConsumerLayout,
  resolveConsumerSlug,
  resolveGeneratedModulePath,
  resolveVendoringDir,
} from '../vendoring/paths.js';

export interface ResolvedEntry {
  name: string;
  consumerId: string;
  consumerDir: string;
  consumerSlug: string;
  layout: 'sibling' | 'vendored';
  source: 'local' | 'registry';
  specifier: string;
  localPath?: string;
  vendoredPath?: string;
  buildCommand?: string;
  prebuilt?: boolean;
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
  const vendoringDir = resolveVendoringDir(config);

  for (const [consumerId, consumer] of Object.entries(config.consumers)) {
    const consumerDir = path.resolve(root, consumer.dir);
    const consumerSlug = resolveConsumerSlug(config, consumerDir);
    const layout = resolveConsumerLayout(config, consumerId);

    for (const depName of consumer.dependencies) {
      const pkgEntry = config.packages[depName];
      if (!pkgEntry) {
        throw new Error(
          `Package "${depName}" listed in consumer "${consumerId}" but not defined in packages.`
        );
      }

      const mode = effectiveMode(config, depName, options.mode);
      const source = resolveSourceForPackage(config, depName, pkgEntry, mode, {
        consumerSlug,
        layout,
      });
      const localAbs = path.resolve(root, pkgEntry.local.path);

      let specifier: string;
      let vendoredPath: string | undefined;

      if (source === 'local') {
        if (layout === 'vendored') {
          vendoredPath = resolveGeneratedModulePath(vendoringDir, pkgEntry.local.path);
          const vendoredAbs = path.join(consumerDir, vendoredPath);
          specifier = toFileSpecifier(consumerDir, vendoredAbs);
        } else {
          specifier = toFileSpecifier(consumerDir, localAbs);
        }
      } else {
        specifier = pkgEntry.registry.version;
      }

      entries.push({
        name: depName,
        consumerId,
        consumerDir,
        consumerSlug,
        layout,
        source,
        specifier,
        localPath: source === 'local' ? pkgEntry.local.path : undefined,
        vendoredPath: source === 'local' && layout === 'vendored' ? vendoredPath : undefined,
        buildCommand: source === 'local' ? pkgEntry.local.build : undefined,
        prebuilt: source === 'local' ? pkgEntry.prebuilt === true : undefined,
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
