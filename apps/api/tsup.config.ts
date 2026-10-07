import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts', worker: 'src/worker.ts' },
  format: ['cjs'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  noExternal: ['@sceneos/shared'],
});
