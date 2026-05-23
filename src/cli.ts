#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  loadConfig,
  resolve,
  apply,
  check,
  build,
  formatPlan,
  formatCheckResult,
  formatBuildSummary,
  formatDockerHints,
  INIT_CONFIG_TEMPLATE,
} from './index.js';

function parseArgs(argv: string[]) {
  const args = [...argv];
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  while (args.length > 0) {
    const arg = args[0]!;
    if (arg === '--') {
      args.shift();
      positional.push(...args);
      break;
    }
    if (arg.startsWith('--')) {
      args.shift();
      const [key, val] = arg.slice(2).split('=');
      if (val !== undefined) {
        flags[key!] = val;
      } else if (args[0] && !args[0].startsWith('--')) {
        flags[key!] = args.shift()!;
      } else {
        flags[key!] = true;
      }
    } else {
      positional.push(args.shift()!);
    }
  }

  return { command: positional[0] ?? 'help', positional: positional.slice(1), flags };
}

function flagStr(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === 'string' ? v : undefined;
}

function flagBool(flags: Record<string, string | boolean>, name: string): boolean {
  return flags[name] === true;
}

function flagStringList(flags: Record<string, string | boolean>, name: string): string[] {
  const value = flags[name];
  if (!value) return [];
  if (typeof value === 'string') {
    return value.split(',').map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

function printHelp(): void {
  console.log(`@panomapp/drs — Dependency Resolver

Usage:
  drs build [--dry-run] [--skip-install] [--if-stale] [--skip-consumer id[,id]] [--mode ...] [--config path] [--verbose] [--quiet]
  drs check [--skip-consumer id[,id]] [--mode ...] [--config path] [--quiet]
  drs resolve [--print human|json] [--mode local|registry|auto] [--config path]
  drs apply [--dry-run] [--build] [--install] [--mode ...] [--config path] [--verbose] [--quiet]
  drs check [--mode ...] [--config path] [--quiet]
  drs init [--config path]
  drs docker [--config path]

Environment:
  DRS_CONFIG          Path to drs.config.json
  DRS_MODE            global mode: local | registry | auto
  DRS_PACKAGE_<name>  Per-package mode (/ → __ in scoped names)

Examples:
  drs build
  drs build --if-stale
  drs build --dry-run
  drs check
`);
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const configPath = flagStr(flags, 'config');
  const mode = flagStr(flags, 'mode') as 'local' | 'registry' | 'auto' | undefined;
  const cwd = flagStr(flags, 'root') ?? process.cwd();
  const verbose = flagBool(flags, 'verbose');
  const quiet = flagBool(flags, 'quiet');

  try {
    switch (command) {
      case 'build': {
        const config = loadConfig({ configPath, cwd });
        const result = build(config, {
          mode,
          dryRun: flagBool(flags, 'dry-run'),
          skipInstall: flagBool(flags, 'skip-install'),
          ifStale: flagBool(flags, 'if-stale'),
          skipConsumers: flagStringList(flags, 'skip-consumer'),
          verbose,
          quiet,
        });
        console.log(formatBuildSummary(result));
        break;
      }
      case 'resolve': {
        const config = loadConfig({ configPath, cwd });
        const plan = resolve(config, { mode });
        const printFormat = flagStr(flags, 'print') ?? 'human';
        console.log(formatPlan(plan, printFormat === 'json' ? 'json' : 'human'));
        break;
      }
      case 'apply': {
        const config = loadConfig({ configPath, cwd });
        const plan = resolve(config, { mode });
        const result = apply(plan, {
          dryRun: flagBool(flags, 'dry-run'),
          runBuild: flagBool(flags, 'build'),
          install: flagBool(flags, 'install'),
          verbose,
          quiet,
        });
        if (flagBool(flags, 'dry-run')) {
          console.log(formatPlan(plan, 'human'));
          console.log('\nDry run — no files written.');
          for (const c of result.changes.filter((x) => x.changed)) {
            console.log(`  would update ${c.name}: ${c.from ?? '(missing)'} → ${c.to}`);
          }
        } else {
          const changed = result.changes.filter((c) => c.changed);
          if (changed.length === 0) {
            console.log('No package.json changes needed.');
          } else {
            console.log(`Updated ${result.wroteFiles.length} file(s):`);
            for (const f of result.wroteFiles) {
              console.log(`  ${f}`);
            }
          }
          if (result.build?.built.length) {
            console.log(`Built: ${result.build.built.join(', ')}`);
          }
          if (result.installResult?.installed.length) {
            console.log(`Installed: ${result.installResult.installed.join(', ')}`);
          }
        }
        break;
      }
      case 'check': {
        const config = loadConfig({ configPath, cwd });
        const result = check(config, {
          mode,
          quiet,
          skipConsumers: flagStringList(flags, 'skip-consumer'),
        });
        console.log(formatCheckResult(result));
        if (!result.ok) {
          process.exitCode = 1;
        }
        break;
      }
      case 'init': {
        const target =
          configPath ??
          (process.env.DRS_CONFIG
            ? path.isAbsolute(process.env.DRS_CONFIG)
              ? process.env.DRS_CONFIG
              : path.join(cwd, process.env.DRS_CONFIG)
            : path.join(cwd, 'drs.config.json'));
        if (fs.existsSync(target)) {
          console.error(`Config already exists: ${target}`);
          process.exitCode = 1;
          break;
        }
        fs.writeFileSync(target, `${JSON.stringify(INIT_CONFIG_TEMPLATE, null, 2)}\n`, 'utf8');
        console.log(`Created ${target}`);
        break;
      }
      case 'docker': {
        const config = loadConfig({ configPath, cwd });
        const plan = resolve(config, { mode });
        console.log(formatDockerHints(plan.docker));
        break;
      }
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exitCode = 1;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (verbose && err instanceof Error && err.stack) {
      console.error(err.stack);
    } else {
      console.error(`drs: ${msg}`);
    }
    process.exitCode = 1;
  }
}

main();
