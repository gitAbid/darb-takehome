/**
 * Reports the test pyramid: how many tests live in __tests__/unit, /integration and /e2e, against the target mix
 * (50 % business logic, 30 % integration, 20 % end-to-end). Usage: npm run test:mix
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

const LAYERS = [
  { name: 'unit', target: 50 },
  { name: 'integration', target: 30 },
  { name: 'e2e', target: 20 },
] as const;

interface JestReport {
  testResults: { name: string; assertionResults: unknown[] }[];
}

main();

function main(): void {
  const counts = countByLayer(runJest());
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  for (const { name, target } of LAYERS) {
    const count = counts.get(name) ?? 0;
    const share = total === 0 ? 0 : Math.round((count / total) * 100);
    console.log(
      `${name.padEnd(12)} ${String(count).padStart(4)}  ${String(share).padStart(3)} %  (target ${target} %)`,
    );
  }
  console.log(`${'total'.padEnd(12)} ${String(total).padStart(4)}`);
}

function runJest(): JestReport {
  const dir = mkdtempSync(join(tmpdir(), 'test-mix-'));
  const output = join(dir, 'report.json');
  try {
    execFileSync('npx', ['jest', '--silent', '--json', `--outputFile=${output}`], { stdio: 'ignore' });
  } catch {
    // Failing tests still produce a report; the counts are what matter here.
  }
  const report = JSON.parse(readFileSync(output, 'utf8')) as JestReport;
  rmSync(dir, { recursive: true, force: true });
  return report;
}

function countByLayer(report: JestReport): Map<string, number> {
  const counts = new Map<string, number>();
  const testsRoot = join(process.cwd(), '__tests__');
  for (const result of report.testResults) {
    const layer = relative(testsRoot, result.name).split(sep)[0];
    counts.set(layer, (counts.get(layer) ?? 0) + result.assertionResults.length);
  }
  return counts;
}
