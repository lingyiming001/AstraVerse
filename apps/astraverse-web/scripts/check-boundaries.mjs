import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const failures = [];
function inspect(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = resolve(dir, item.name);
    if (item.isDirectory()) { inspect(file); continue; }
    if (!/\.(ts|tsx)$/.test(item.name)) continue;
    const owner = relative(root, file).replaceAll('\\', '/');
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'](@\/[^"']+)["']/g)) {
      const spec = match[1].slice(2);
      const target = resolve(root, spec);
      if (![target, target + '.ts', target + '.tsx', target + '.d.ts', resolve(target, 'index.ts'), resolve(target, 'index.tsx')].some(existsSync)) failures.push(`${owner}: unresolved ${match[1]}`);
      if (owner.startsWith('shared/') && /^(features|app)\//.test(spec)) failures.push(`${owner}: shared cannot depend on ${spec}`);
      if (owner.startsWith('features/') && spec.startsWith('app/')) failures.push(`${owner}: features cannot depend on app`);
    }
  }
}
inspect(root);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log('Module boundaries and alias imports: OK');
