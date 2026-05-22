export type { DrsConfig, DrsMode, DrsLayout, DrsSource, PackageEntry, ConsumerConfig, VendoringConfig } from './config/schema.js';
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
export { isCiEnvironment } from './resolve/env.js';

export type { ApplyResult, PackageJsonChange } from './apply/package-json.js';
export { applyPackageJson } from './apply/package-json.js';
export type { BuildResult } from './apply/build.js';
export { runLocalBuilds, runConsumerInstall } from './apply/build.js';

export type { DriftItem, CheckResult } from './check/drift.js';
export { check, isStale } from './check/drift.js';
export type { VendoredDriftItem, VendoredDriftReason } from './check/vendored.js';
export { checkVendoredDrift } from './check/vendored.js';

export { formatDockerHints, getDockerHints } from './docker/hints.js';
export { formatPlan, formatCheckResult } from './format.js';

export type { BuildOptions, BuildRunResult } from './build/run.js';
export { build, formatBuildSummary } from './build/run.js';

export type { VendoredSourcePackage, VendoringPlan } from './vendoring/plan.js';
export { getVendoringPlan, formatNpmInstallCommand, packageUsesSourceForConsumer } from './vendoring/plan.js';
export { syncVendoredModules } from './vendoring/sync.js';
export { buildSourcePackagesForVendoring, buildVendoredModules, copyVendoredDistArtifacts } from './vendoring/build.js';
export type { VendoringApplyResult } from './vendoring/run.js';
export { runVendoring, listVendoredConsumerDirs } from './vendoring/run.js';
export {
  findConsumerByDir,
  resolveConsumerLayout,
  resolveConsumerSlug,
  resolveGeneratedModulePath,
  resolveVendoringDir,
  getPackageEntry,
} from './vendoring/paths.js';
export type { VendorStampFile, VendorPackageSnapshot } from './vendoring/stamp.js';
export {
  createVendorStamp,
  readVendorStamp,
  snapshotVendoredPackages,
  writeVendorStampForConsumer,
} from './vendoring/stamp.js';
export { hashDirectory, hasDistArtifacts } from './vendoring/fingerprint.js';

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
  quiet?: boolean;
}

export function apply(plan: ResolutionPlan, options: ApplyOptions = {}): ApplyResult & {
  build?: ReturnType<typeof runLocalBuilds>;
  installResult?: ReturnType<typeof runConsumerInstall>;
} {
  const result = applyPackageJson(plan, { dryRun: options.dryRun });

  let buildResult;
  if (options.runBuild && !options.dryRun) {
    buildResult = runLocalBuilds(plan, { verbose: options.verbose });
    if (buildResult.errors.length > 0) {
      throw new Error(`DRS local build failed:\n${buildResult.errors.join('\n')}`);
    }
  }

  let installResult;
  if (options.install && !options.dryRun) {
    installResult = runConsumerInstall(plan, { verbose: options.verbose });
    if (installResult.errors.length > 0) {
      throw new Error(`DRS npm install failed:\n${installResult.errors.join('\n')}`);
    }
  }

  return { ...result, build: buildResult, installResult };
}

export const INIT_CONFIG_TEMPLATE = {
  $schema: './node_modules/@panomapp/drs/schema/drs.config.schema.json',
  version: 1,
  root: '.',
  defaults: { mode: 'auto', layout: 'sibling' },
  vendoring: {
    dir: 'generated_modules',
    exclude: ['.git', 'node_modules', 'dist', '.turbo', '.next', '.DS_Store'],
  },
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
