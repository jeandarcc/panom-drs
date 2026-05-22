import type { DrsConfig } from '../config/schema.js';
import type { ResolveOptions, ResolutionPlan } from '../resolve/plan.js';
import { resolve } from '../resolve/plan.js';
import { applyPackageJson, type ApplyResult } from '../apply/package-json.js';
import { runLocalBuilds, runConsumerInstall } from '../apply/build.js';
import { check, type CheckResult } from '../check/drift.js';
import { formatCheckResult, formatPlan } from '../format.js';
import { isCiEnvironment } from '../resolve/env.js';
import { runVendoring, type VendoringApplyResult } from '../vendoring/run.js';
import { createDrsLog, resolveLog, type DrsProgressOptions } from '../log.js';

export interface BuildOptions extends ResolveOptions, DrsProgressOptions {
  dryRun?: boolean;
  skipInstall?: boolean;
  ifStale?: boolean;
  verbose?: boolean;
}

export type FullApplyResult = ApplyResult & {
  build?: ReturnType<typeof runLocalBuilds>;
  vendoring?: VendoringApplyResult;
  installResult?: ReturnType<typeof runConsumerInstall>;
};

export interface BuildRunResult {
  plan: ResolutionPlan;
  applyResult: FullApplyResult;
  checkResult: CheckResult;
  ci: boolean;
  skipped?: boolean;
}

function runApply(
  config: DrsConfig,
  plan: ResolutionPlan,
  options: {
    dryRun?: boolean;
    runBuild?: boolean;
    install?: boolean;
    verbose?: boolean;
    quiet?: boolean;
    log?: ReturnType<typeof createDrsLog>;
  }
): FullApplyResult {
  const log = resolveLog(options);
  let vendoring: VendoringApplyResult | undefined;
  if (options.runBuild && !options.dryRun) {
    log.progress('syncing vendored modules…');
    vendoring = runVendoring(config, plan, options);
  }

  log.progress('updating consumer package.json files…');
  const result = applyPackageJson(plan, { dryRun: options.dryRun });

  let build;
  if (options.runBuild && !options.dryRun) {
    log.progress('building sibling-layout packages…');
    build = runLocalBuilds(plan, options);
    if (build.errors.length > 0) {
      throw new Error(`DRS local build failed:\n${build.errors.join('\n')}`);
    }
  }

  let installResult;
  if (options.install && !options.dryRun) {
    log.progress('running npm install in consumers…');
    installResult = runConsumerInstall(plan, options);
    if (installResult.errors.length > 0) {
      throw new Error(`DRS npm install failed:\n${installResult.errors.join('\n')}`);
    }
  }

  return { ...result, build, vendoring, installResult };
}

export function build(config: DrsConfig, options: BuildOptions = {}): BuildRunResult {
  const log = resolveLog(options);

  if (options.ifStale) {
    log.progress('checking vendored module drift…');
    const checkResult = check(config, options);
    if (checkResult.ok) {
      log.progress('vendoring is up to date — skipping build.');
      return {
        plan: resolve(config, options),
        applyResult: { dryRun: false, changes: [], wroteFiles: [] },
        checkResult,
        ci: isCiEnvironment(),
        skipped: true,
      };
    }
    log.progress('vendored modules are stale — running full build.');
  }

  const plan = resolve(config, options);
  log.progress(`resolved ${plan.entries.length} dependency entries (mode: ${plan.mode}).`);

  const applyResult = runApply(config, plan, {
    dryRun: options.dryRun,
    runBuild: !options.dryRun,
    install: !options.dryRun && !options.skipInstall,
    verbose: options.verbose,
    quiet: options.quiet,
    log,
  });

  if (options.dryRun) {
    return {
      plan,
      applyResult,
      checkResult: { ok: true, drift: [], vendoredDrift: [], planMode: plan.mode },
      ci: isCiEnvironment(),
    };
  }

  log.progress('verifying build result…');
  const checkResult = check(config, options);
  if (!checkResult.ok) {
    throw new Error(formatCheckResult(checkResult));
  }

  return {
    plan,
    applyResult,
    checkResult,
    ci: isCiEnvironment(),
  };
}

export function formatBuildSummary(result: BuildRunResult): string {
  if (result.skipped) {
    return [
      'DRS vendoring is up to date — skipped build.',
      '',
      formatCheckResult(result.checkResult),
    ].join('\n');
  }

  const lines = [
    formatPlan(result.plan, 'human').trimEnd(),
    '',
    `CI environment: ${result.ci ? 'yes' : 'no'}`,
    '',
  ];

  if (result.applyResult.dryRun) {
    lines.push('Dry run — no files written, no installs.');
    return lines.join('\n');
  }

  if (result.applyResult.vendoring?.synced.length) {
    lines.push(`Synced vendored modules: ${result.applyResult.vendoring.synced.join(', ')}`);
  }
  if (result.applyResult.vendoring?.built.length) {
    lines.push(`Built vendored packages: ${result.applyResult.vendoring.built.join(', ')}`);
  }

  if (result.applyResult.wroteFiles.length > 0) {
    lines.push(`Updated ${result.applyResult.wroteFiles.length} package.json file(s).`);
  } else {
    lines.push('No package.json changes needed.');
  }

  if (result.applyResult.build?.built.length) {
    lines.push(`Built local packages: ${result.applyResult.build.built.join(', ')}`);
  }

  if (result.applyResult.installResult?.installed.length) {
    lines.push(`npm install in: ${result.applyResult.installResult.installed.join(', ')}`);
  }

  lines.push('', formatCheckResult(result.checkResult));
  return lines.join('\n');
}
