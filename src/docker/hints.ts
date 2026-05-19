import path from 'node:path';
import type { DrsConfig } from '../config/schema.js';
import { resolveRoot } from '../config/load.js';
import type { DockerHint, ResolvedEntry } from '../resolve/plan.js';

export function getDockerHints(
  config: DrsConfig,
  entries: ResolvedEntry[]
): DockerHint[] | undefined {
  if (!config.docker) return undefined;

  const hasLocal = entries.some((e) => e.source === 'local');
  if (!hasLocal) return undefined;

  const root = resolveRoot(config);
  const hints: DockerHint[] = [];

  for (const [serviceId, service] of Object.entries(config.docker)) {
    if (!service.whenLocal) continue;
    hints.push({
      serviceId,
      context: path.resolve(root, service.whenLocal.context),
      dockerfile: service.whenLocal.dockerfile,
    });
  }

  return hints.length > 0 ? hints : undefined;
}

export function formatDockerHints(hints: DockerHint[] | undefined): string {
  if (!hints?.length) {
    return 'No Docker hints (registry-only plan or no docker block).';
  }
  const lines = ['Docker build hints (local dependencies):', ''];
  for (const h of hints) {
    lines.push(`  [${h.serviceId}]`);
    lines.push(`    context: ${h.context}`);
    lines.push(`    dockerfile: ${h.dockerfile}`);
    lines.push('');
  }
  return lines.join('\n');
}
