// Vite plugin: put an HTML comment at the top of the built index.html that names every
// third-party npm package bundled into it, with its licence text. Licences such as MIT ask
// for their notice to travel with copies of the code, and minifying strips it from the code.
// The list comes from the modules actually in the bundle, so it follows dependency changes.
// An optional `header` (e.g. your own licence) goes first. Web Worker code is bundled separately
// and is not covered.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function thirdPartyNotices({ header = '' } = {}) {
  return {
    name: 'third-party-notices',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const parts = [header.trim()];
        if (ctx.bundle) {
          const notices = collectNotices(ctx.bundle);
          if (notices.length) parts.push('Third-party software included in this file:', ...notices);
        }
        const text = parts.filter(Boolean).join('\n\n');
        if (!text) return html;
        const comment = `<!--\n${text.replace(/--/g, '- -')}\n-->\n`;
        const doctype = html.match(/^﻿?<!doctype[^>]*>\s*/i);
        return doctype ? html.slice(0, doctype[0].length) + comment + html.slice(doctype[0].length) : comment + html;
      },
    },
  };
}

function collectNotices(bundle) {
  const roots = new Set();
  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk') continue;
    for (const [id, info] of Object.entries(output.modules)) {
      const root = packageRoot(id);
      if (root && info.renderedLength > 0) roots.add(root);
    }
  }
  return [...roots]
    .map(root => {
      const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
      const file = readdirSync(root).find(f => /^(licen[cs]e|copying)(\.|$)/i.test(f));
      const text = file ? readFileSync(path.join(root, file), 'utf8').trim() : `Licence: ${pkg.license ?? 'see package'}`;
      return { name: pkg.name, notice: `${pkg.name} ${pkg.version} (${pkg.license ?? 'see licence'})\n${text}` };
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(n => n.notice);
}

// The folder of the npm package a bundled module comes from, or null for your own code.
function packageRoot(id) {
  const file = id.replace(/\\/g, '/').split('?')[0];
  if (file.startsWith('\0')) return null;
  const i = file.lastIndexOf('/node_modules/');
  if (i === -1) return null;
  const parts = file.slice(i + '/node_modules/'.length).split('/');
  const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  const root = `${file.slice(0, i)}/node_modules/${name}`;
  return existsSync(path.join(root, 'package.json')) ? root : null;
}
