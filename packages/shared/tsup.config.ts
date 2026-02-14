import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/schemas/index.ts', 'src/constants/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
});
