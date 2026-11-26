import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { thirdPartyNotices } from './third-party-notices.mjs';

// The single-file build inlines scripts and styles but not the page icon, so swap it for a data URI.
function inlineFavicon(): Plugin {
  const dataUri = `data:image/png;base64,${readFileSync(new URL('./shared/favicon.png', import.meta.url)).toString('base64')}`;
  return {
    name: 'inline-favicon',
    transformIndexHtml: { order: 'pre', handler: html => html.replace(/href="[^"]*shared\/favicon\.png"/g, `href="${dataUri}"`) },
  };
}

export default defineConfig(() => {
  // Dev serves the whole folder: the landing page at / and each example at /examples/<name>/.
  // Builds go through scripts/build-examples.mjs, one single-file app per example.
  return {
    plugins: [
      inlineFavicon(),
      viteSingleFile(),
      basicSsl({ name: 'cansub-app' }),
      thirdPartyNotices(),
    ],
    build: {
      minify: 'terser',
      terserOptions: {
        mangle: true,
        compress: { drop_console: true, drop_debugger: true },
      },
      rollupOptions: {
        output: { compact: true },
      },
    },
    server: {
      open: true,
      // A Python venv for test scripts (see AGENTS.md) must not trigger reloads.
      watch: { ignored: ['**/.venv/**', '**/.playwright-mcp/**'] },
    },
  };
});
