export type { DrsConfig, DrsMode, DrsSource, PackageEntry, ConsumerConfig } from './config/schema.js';
export { drsConfigSchema, configSchema } from './config/schema.js';
export { loadConfig, findConfigPath, resolveRoot, packageEnvKey, resolveModeFromEnv } from './config/load.js';
export type { LoadConfigOptions } from './config/load.js';

export type {
  ResolvedEntry,
  ResolutionPlan,
  ResolveOptions,
  DockerHint,
} from './resolve/plan.js';
export { resolve } from './resolve/plan.js';
export { toFileSpecifier, normalizeForCompare } from './resolve/paths.js';

export type { ApplyResult, PackageJsonChange } from './apply/package-json.js';
export { applyPackageJson } from './apply/package-json.js';
export type { BuildResult } from './apply/build.js';
export { runLocalBuilds, runConsumerInstall } from './apply/build.js';

export type { DriftItem, CheckResult } from './check/drift.js';
export { check } from './check/drift.js';

export { formatDockerHints, getDockerHints } from './docker/hints.js';

import type { ResolutionPlan } from './resolve/plan.js';
import type { DrsConfig } from './config/schema.js';
import type { ResolveOptions } from './resolve/plan.js';
import { resolve } from './resolve/plan.js';
import { applyPackageJson, type ApplyResult } from './apply/package-json.js';
import { runLocalBuilds, runConsumerInstall } from './apply/build.js';
import { check, type CheckResult } from './check/drift.js';

export interface ApplyOptions {
  dryRun?: boolean;
  runBuild?: boolean;
  install?: boolean;
  verbose?: boolean;
}

export function apply(plan: ResolutionPlan, options: ApplyOptions = {}): ApplyResult & {
  build?: ReturnType<typeof runLocalBuilds>;
  installResult?: ReturnType<typeof runConsumerInstall>;
} {
  const result = applyPackageJson(plan, { dryRun: options.dryRun });

  let build;
  if (options.runBuild && !options.dryRun) {
    build = runLocalBuilds(plan, { verbose: options.verbose });
    if (build.errors.length > 0) {
      throw new Error(`DRS local build failed:\n${build.errors.join('\n')}`);
    }
  }

  let installResult;
  if (options.install && !options.dryRun) {
    installResult = runConsumerInstall(plan, { verbose: options.verbose });
    if (installResult.errors.length > 0) {
      throw new Error(`DRS npm install failed:\n${installResult.errors.join('\n')}`);
    }
  }

  return { ...result, build, installResult };
}

export function formatPlan(plan: ResolutionPlan, format: 'human' | 'json' = 'human'): string {
  if (format === 'json') {
    return JSON.stringify(plan, null, 2);
  }
  const lines = [
    `DRS resolution plan (mode: ${plan.mode}, root: ${plan.root})`,
    '',
  ];
  for (const e of plan.entries) {
    lines.push(
      `  ${e.consumerId} → ${e.name}`,
      `    source: ${e.source}`,
      `    specifier: ${e.specifier}`,
    );
    if (e.buildCommand) {
      lines.push(`    build: ${e.buildCommand}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function formatCheckResult(result: CheckResult): string {
  if (result.ok) {
    return `OK — all dependencies match plan (mode: ${result.planMode}).`;
  }
  const lines = [`DRIFT detected (mode: ${result.planMode}):`, ''];
  for (const d of result.drift) {
    lines.push(`  [${d.consumerId}] ${d.name}`);
    lines.push(`    expected: ${d.expected}`);
    lines.push(`    actual:   ${d.actual ?? '(missing)'}`);
    lines.push('');
  }
  lines.push('Run: drs apply');
  return lines.join('\n');
}

export const INIT_CONFIG_TEMPLATE = {
  $schema: './node_modules/@panomapp/drs/schema/drs.config.schema.json',
  version: 1,
  root: '.',
  defaults: { mode: 'auto' },
  packages: {
    '@panomapp/example': {
      local: { path: 'packages/example', build: 'npm run build' },
      registry: { version: '^1.0.0' },
    },
  },
  consumers: {
    app: {
      dir: 'apps/my-app',
      dependencies: ['@panomapp/example'],
    },
  },
} as const;

export function runResolveAndApply(
  config: DrsConfig,
  resolveOptions?: ResolveOptions,
  applyOptions?: ApplyOptions
): ResolutionPlan {
  const plan = resolve(config, resolveOptions);
  apply(plan, applyOptions);
  return plan;
}
