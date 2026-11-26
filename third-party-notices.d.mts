import type { Plugin } from 'vite';

/** Vite plugin: licence notices of the bundled third-party packages, as a comment at the top of index.html. */
export function thirdPartyNotices(options?: { header?: string }): Plugin;
