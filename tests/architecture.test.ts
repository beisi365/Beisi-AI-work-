import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('架构约束', () => {
  it('localStorage 仅允许在 LocalDataLayer.ts 中引用', () => {
    const files = walk(SRC);
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith('LocalDataLayer.ts')) continue;
      const content = readFileSync(f, 'utf8');
      if (/localStorage/.test(content)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
