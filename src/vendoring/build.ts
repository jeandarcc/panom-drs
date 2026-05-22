import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { DrsConfig } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import { findConsumerByDir } from './paths.js';
import { getVendoringPlan } from './plan.js';
import { resolveLog, type DrsProgressOptions } from '../log.js';

export interface VendoredBuildResult {
  built: string[];
  skipped: string[];
  errors: string[];
}

export function buildSourcePackagesForVendoring(
  config: DrsConfig,
  consumerCwd: string,
  options: DrsProgressOptions & { verbose?: boolean } = {}
): VendoredBuildResult {
  const plan = getVendoringPlan(config, consumerCwd);
  const root = resolveRoot(config);
  const built: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const log = resolveLog(options);

  for (const sourcePackage of plan.sourcePackages) {
    if (sourcePackage.prebuilt || !sourcePackage.buildCommand) {
      skipped.push(sourcePackage.sourcePath);
      continue;
    }
    if (seen.has(sourcePackage.sourcePath)) continue;
    seen.add(sourcePackage.sourcePath);

    const packageDir = path.resolve(root, sourcePackage.sourcePath);
    try {
      log.progress(`  source npm install ${sourcePackage.sourcePath}`);
      execSync('npm install', {
        cwd: packageDir,
        stdio: options.verbose ? 'inherit' : 'pipe',
        env: process.env,
      });
      log.progress(`  source build ${sourcePackage.sourcePath}: ${sourcePackage.buildCommand}`);
      execSync(sourcePackage.buildCommand, {
        cwd: packageDir,
        stdio: options.verbose ? 'inherit' : 'pipe',
        env: process.env,
      });
      built.push(sourcePackage.sourcePath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${sourcePackage.sourcePath}: ${msg}`);
    }
  }

  return { built, skipped, errors };
}

export function copyVendoredDistArtifacts(config: DrsConfig, consumerCwd: string): string[] {
  const plan = getVendoringPlan(config, consumerCwd);
  const root = resolveRoot(config);
  const { consumerDir } = findConsumerByDir(config, consumerCwd);
  const copied: string[] = [];

  for (const sourcePackage of plan.sourcePackages) {
    const sourceDist = path.join(root, sourcePackage.sourcePath, 'dist');
    if (!fs.existsSync(sourceDist)) continue;

    const targetDist = path.join(consumerDir, sourcePackage.generatedPath, 'dist');
    fs.rmSync(targetDist, { recursive: true, force: true });
    fs.cpSync(sourceDist, targetDist, { recursive: true });
    copied.push(sourcePackage.generatedPath);
  }

  return copied;
}

export function buildVendoredModules(
  config: DrsConfig,
  consumerCwd: string,
  options: DrsProgressOptions & { verbose?: boolean } = {}
): VendoredBuildResult {
  const plan = getVendoringPlan(config, consumerCwd);
  const { consumerDir } = findConsumerByDir(config, consumerCwd);
  const built: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const log = resolveLog(options);

  for (const sourcePackage of plan.sourcePackages) {
    const packageDir = path.join(consumerDir, sourcePackage.generatedPath);
    const distDir = path.join(packageDir, 'dist');

    try {
      log.progress(`  vendored npm install ${sourcePackage.generatedPath}`);
      execSync('npm install', {
        cwd: packageDir,
        stdio: options.verbose ? 'inherit' : 'pipe',
        env: process.env,
      });

      if (sourcePackage.prebuilt) {
        if (sourcePackage.buildCommand) {
          log.progress(
            `  vendored validate ${sourcePackage.generatedPath}: ${sourcePackage.buildCommand}`
          );
          execSync(sourcePackage.buildCommand, {
            cwd: packageDir,
            stdio: options.verbose ? 'inherit' : 'pipe',
            env: process.env,
          });
        }
        skipped.push(sourcePackage.generatedPath);
        continue;
      }

      if (fs.existsSync(distDir)) {
        skipped.push(sourcePackage.generatedPath);
        continue;
      }

      if (!sourcePackage.buildCommand) {
        skipped.push(sourcePackage.generatedPath);
        continue;
      }

      log.progress(
        `  vendored build ${sourcePackage.generatedPath}: ${sourcePackage.buildCommand}`
      );
      execSync(sourcePackage.buildCommand, {
        cwd: packageDir,
        stdio: options.verbose ? 'inherit' : 'pipe',
        env: process.env,
      });
      built.push(sourcePackage.generatedPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${sourcePackage.generatedPath}: ${msg}`);
    }
  }

  return { built, skipped, errors };
}
