import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'middleware/express': 'src/middleware/express.ts',
    'middleware/hono': 'src/middleware/hono.ts',
    'middleware/nextjs': 'src/middleware/nextjs.ts',
    'middleware/fastify': 'src/middleware/fastify.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  external: ['express', 'hono', 'next', 'fastify', 'next/server'],
});
