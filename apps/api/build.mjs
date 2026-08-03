import { build } from 'esbuild';

/**
 * Production bundle.
 *
 * Workspace packages are published as raw TypeScript, so the API is bundled
 * rather than emitted file-by-file — that is what lets `@aegisdrive/shared` be
 * consumed without a separate build step.
 *
 * Prisma is external on purpose: the generated client resolves its query engine
 * binary relative to `node_modules/.prisma/client` at runtime, which a bundle
 * would break.
 */
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.mjs',
  platform: 'node',
  target: 'node22',
  format: 'esm',
  bundle: true,
  minify: true,
  sourcemap: true,
  logLevel: 'info',
  // Node builtins are external automatically. Everything else is bundled so the
  // workspace TypeScript packages come along, except the two that must not be.
  external: [
    '@prisma/client',
    '.prisma/client',
    // Dev-only log formatter, loaded through a worker thread that a bundle cannot resolve.
    'pino-pretty',
  ],
  banner: {
    // ESM output has no `require`; several transitive CJS dependencies still expect it.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});
