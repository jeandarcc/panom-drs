import type { ResolutionPlan } from './resolve/plan.js';
import type { CheckResult } from './check/drift.js';

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
    return `OK — dependencies and vendored modules match plan (mode: ${result.planMode}).`;
  }
  const lines = [`DRIFT detected (mode: ${result.planMode}):`, ''];

  for (const d of result.drift) {
    lines.push(`  [${d.consumerId}] ${d.name} (package.json)`);
    lines.push(`    expected: ${d.expected}`);
    lines.push(`    actual:   ${d.actual ?? '(missing)'}`);
    lines.push('');
  }

  for (const d of result.vendoredDrift) {
    lines.push(`  [${d.consumerId}] ${d.name} (${d.reason})`);
    lines.push(`    ${d.detail}`);
    lines.push('');
  }

  lines.push('Run: drs build');
  return lines.join('\n');
}
