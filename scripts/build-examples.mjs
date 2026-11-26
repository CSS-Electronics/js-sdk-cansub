// Build each example in examples/ into one self-contained file: dist/<name>.html.
// Usage: node scripts/build-examples.mjs [name ...]   (no names = every example)
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = path.join(ROOT, 'examples');
const DIST = path.join(ROOT, 'dist');

const all = readdirSync(EXAMPLES).filter(n => existsSync(path.join(EXAMPLES, n, 'index.html')));
const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
const unknown = names.filter(n => !all.includes(n));
if (unknown.length) {
  console.error(`Unknown example(s): ${unknown.join(', ')}. Available: ${all.join(', ')}`);
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });
for (const name of names) {
  const tmp = path.join(DIST, `.build-${name}`);
  await build({
    configFile: path.join(ROOT, 'vite.config.ts'),
    root: path.join(EXAMPLES, name),
    envDir: ROOT,
    logLevel: 'warn',
    build: { outDir: tmp, emptyOutDir: true },
  });
  copyFileSync(path.join(tmp, 'index.html'), path.join(DIST, `${name}.html`));
  rmSync(tmp, { recursive: true, force: true });
  console.log(`dist/${name}.html`);
}
