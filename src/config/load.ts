import fs from 'node:fs';
import path from 'node:path';
import { drsConfigSchema, drsModeSchema, type DrsConfig, type DrsMode } from './schema.js';

const VALID_MODES = drsModeSchema.options;

function isValidMode(value: string | undefined): value is DrsMode {
  return value !== undefined && (VALID_MODES as readonly string[]).includes(value);
}

const DEFAULT_CONFIG_NAMES = ['drs.config.json'];

export interface LoadConfigOptions {
  configPath?: string;
  cwd?: string;
}

export function findConfigPath(options: LoadConfigOptions = {}): string {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  if (options.configPath) {
    return path.isAbsolute(options.configPath)
      ? options.configPath
      : path.join(cwd, options.configPath);
  }
  const envPath = process.env.DRS_CONFIG;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.join(cwd, envPath);
  }
  for (const name of DEFAULT_CONFIG_NAMES) {
    const candidate = path.join(cwd, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `DRS config not found. Create drs.config.json or set DRS_CONFIG. Searched: ${DEFAULT_CONFIG_NAMES.join(', ')} in ${cwd}`
  );
}

export function loadConfig(options: LoadConfigOptions = {}): DrsConfig {
  const configPath = findConfigPath(options);
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown;
  const parsed = drsConfigSchema.parse(raw);
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const configDir = path.dirname(configPath);
  return {
    ...parsed,
    root: path.resolve(configDir, parsed.root),
  };
}

export function resolveRoot(config: DrsConfig): string {
  return path.resolve(config.root);
}

/** Env key for per-package override: DRS_PACKAGE_@panomapp__hsm-panom-contract */
export function packageEnvKey(packageName: string): string {
  return `DRS_PACKAGE_${packageName.replace(/\//g, '__')}`;
}

export function resolveModeFromEnv(
  packageName: string | null,
  fallback: DrsMode
): DrsMode | undefined {
  if (packageName) {
    const pkgMode = process.env[packageEnvKey(packageName)];
    if (isValidMode(pkgMode)) {
      return pkgMode;
    }
  }
  const globalMode = process.env.DRS_MODE;
  if (isValidMode(globalMode)) {
    return globalMode;
  }
  return undefined;
}
