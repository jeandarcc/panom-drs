import { execSync } from 'node:child_process';
import path from 'node:path';
import type { ResolutionPlan } from '../resolve/plan.js';

export interface BuildResult {
  built: string[];
  skipped: string[];
  errors: string[];
}

export function runLocalBuilds(plan: ResolutionPlan, options: { verbose?: boolean } = {}): BuildResult {
  const built: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const entry of plan.entries) {
    if (entry.source !== 'local' || !entry.buildCommand || !entry.localPath) {
      continue;
    }
    if (entry.layout === 'vendored') {
      continue;
    }
    const key = `${entry.localPath}:${entry.buildCommand}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pkgDir = path.resolve(plan.root, entry.localPath);
    try {
      if (options.verbose) {
        console.error(`[drs] build ${entry.localPath}: ${entry.buildCommand}`);
      }
      execSync(entry.buildCommand, {
        cwd: pkgDir,
        stdio: options.verbose ? 'inherit' : 'pipe',
        env: process.env,
      });
      built.push(entry.localPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${entry.localPath}: ${msg}`);
    }
  }

  return { built, skipped, errors };
}

export function runConsumerInstall(
  plan: ResolutionPlan,
  options: { verbose?: boolean } = {}
): { installed: string[]; errors: string[] } {
  const installed: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const entry of plan.entries) {
    if (seen.has(entry.consumerDir)) continue;
    seen.add(entry.consumerDir);
    try {
      if (options.verbose) {
        console.error(`[drs] npm install in ${entry.consumerDir}`);
      }
      execSync('npm install', {
        cwd: entry.consumerDir,
        stdio: options.verbose ? 'inherit' : 'pipe',
        env: process.env,
      });
      installed.push(entry.consumerDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${entry.consumerDir}: ${msg}`);
    }
  }

  return { installed, errors };
}
