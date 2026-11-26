// Build publishable packages into dist/: minified ES modules, readable .d.ts, and a
// dist/package.json that points at them. Publish from dist/, never from the package folder:
// the source package.json serves src/ so apps in the workspace always run live source.
//
// Usage:
//   node scripts/build-package.mjs                  all packages in release-config.json "publish" order
//   node scripts/build-package.mjs <dir> [<dir>...]  the given package folders, in the given order
// Order matters: a package's .d.ts build reads the built .d.ts of the packages it depends on.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { init, parse } from 'es-module-lexer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_URL = 'https://github.com/CSS-Electronics/js-sdk-cansub';
const CONFIG = path.join(ROOT, 'scripts/release-config.json');
// Every package carries its own LICENSE. Internally each copy must match the canonical text.
const CANONICAL_LICENSE = path.join(ROOT, 'licenses/cansub-sdk-license.txt');

const config = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : null;
const args = process.argv.slice(2);
const dirs = args.length
  ? args.map(d => path.resolve(d))
  : config.publish.map(p => path.join(ROOT, 'packages', p));

const EXCLUDE = /(^|\/)__tests__\/|\.(test|bench|perf\.test)\.ts$|\.test-utils\.ts$/;

await init;
for (const dir of dirs) await buildPackage(dir);

async function buildPackage(dir) {
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const folder = path.basename(dir);
  const dist = path.join(dir, 'dist');
  console.log(`[build] ${pkg.name}@${pkg.version}`);
  const license = path.join(dir, 'LICENSE');
  if (!existsSync(license)) throw new Error(`${pkg.name}: no LICENSE file in ${dir}`);
  if (existsSync(CANONICAL_LICENSE) && text(license) !== text(CANONICAL_LICENSE)) {
    throw new Error(`${pkg.name}: LICENSE differs from licenses/cansub-sdk-license.txt (copy it over)`);
  }

  rmSync(dist, { recursive: true, force: true });

  // 1. Type declarations. tsconfig.build.json keeps rootDir=src and paths={}, so the tree is flat.
  const tsc = createRequire(path.join(dir, 'package.json')).resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: dir, stdio: 'inherit' });
  if (!existsSync(path.join(dist, 'index.d.ts'))) {
    throw new Error(`${pkg.name}: no dist/index.d.ts (nested dist? check tsconfig.build.json rootDir/paths)`);
  }
  for (const f of walk(dist)) if (EXCLUDE.test(f) || f.endsWith('.test-utils.d.ts')) rmSync(path.join(dist, f));

  // 2. One minified module per source file, so subpath imports (e.g. a worker) keep working.
  const entryPoints = walk(path.join(dir, 'src'))
    .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts') && !EXCLUDE.test(f))
    .map(f => path.join(dir, 'src', f));
  await build({
    entryPoints,
    outdir: dist,
    outbase: path.join(dir, 'src'),
    tsconfig: path.join(dir, 'tsconfig.json'),
    bundle: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    minify: true,
    keepNames: true,
    banner: { js: `/*! ${pkg.name} v${pkg.version} (c) CSS Electronics ApS, see LICENSE */` },
    logLevel: 'warning',
  });

  // 3. Explicit .js extensions on relative imports, so the output also loads in plain Node ESM.
  for (const f of walk(dist).filter(f => f.endsWith('.js'))) {
    const file = path.join(dist, f);
    const code = readFileSync(file, 'utf8');
    const [imports] = parse(code);
    let out = '';
    let last = 0;
    for (const { n, s, e } of imports) {
      if (!n || !/^\.\.?\//.test(n) || /\.(m?js|json)$/.test(n)) continue;
      const base = path.resolve(path.dirname(file), n);
      const spec = existsSync(`${base}.js`) ? `${n}.js`
        : existsSync(path.join(base, 'index.js')) ? `${n}/index.js`
        : null;
      if (!spec) throw new Error(`${pkg.name}: cannot resolve '${n}' in ${f}`);
      out += code.slice(last, s) + spec;
      last = e;
    }
    if (last) writeFileSync(file, out + code.slice(last));
  }
  // Same for the declarations (TypeScript maps './x.js' to './x.d.ts'), for node16/nodenext users.
  for (const f of walk(dist).filter(f => f.endsWith('.d.ts'))) {
    const file = path.join(dist, f);
    const code = readFileSync(file, 'utf8');
    const out = code.replace(/((?:from|import)\s*\(?\s*)(["'])(\.\.?\/[^"']+)\2/g, (m, pre, q, n) => {
      if (/\.(m?js|json)$/.test(n)) return m;
      const base = path.resolve(path.dirname(file), n);
      const spec = existsSync(`${base}.d.ts`) ? `${n}.js`
        : existsSync(path.join(base, 'index.d.ts')) ? `${n}/index.js`
        : null;
      if (!spec) throw new Error(`${pkg.name}: cannot resolve '${n}' in ${f}`);
      return `${pre}${q}${spec}${q}`;
    });
    if (out !== code) writeFileSync(file, out);
  }

  // 4. The manifest npm users see.
  const isPublicSource = config ? config.publicSource.includes(folder) : true;
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    keywords: pkg.keywords,
    license: 'SEE LICENSE IN LICENSE',
    author: 'CSS Electronics ApS',
    homepage: `${REPO_URL}#readme`,
    ...(isPublicSource && {
      repository: { type: 'git', url: `git+${REPO_URL}.git`, directory: `packages/${folder}` },
    }),
    type: 'module',
    main: './index.js',
    types: './index.d.ts',
    exports: distExports(pkg.exports),
    dependencies: pkg.dependencies,
    peerDependencies: pkg.peerDependencies,
    peerDependenciesMeta: pkg.peerDependenciesMeta,
  };
  writeFileSync(path.join(dist, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  copyFileSync(license, path.join(dist, 'LICENSE'));
  if (existsSync(path.join(dir, 'README.md'))) copyFileSync(path.join(dir, 'README.md'), path.join(dist, 'README.md'));
}

// Source exports point at ./src (code) and ./dist (types); the published ones sit at the dist root.
function distExports(exports) {
  const map = target => target
    .replace(/^\.\/dist\//, './')
    .replace(/^\.\/src\/(.*)\.ts$/, './$1.js')
    .replace(/^\.\/src\/\*$/, './*.js');
  return Object.fromEntries(Object.entries(exports).map(([key, { types, default: code }]) => [
    key, { types: map(types), default: map(code) },
  ]));
}

// Licence text compared without line endings, which git may convert per file on checkout.
function text(file) {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function walk(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory()
    ? walk(path.join(dir, d.name), `${prefix}${d.name}/`)
    : [`${prefix}${d.name}`]);
}
