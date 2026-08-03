import { build } from 'esbuild';

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
  // Prisma resolves its query engine relative to node_modules at runtime.
  external: ['@prisma/client', '.prisma/client'],
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});
