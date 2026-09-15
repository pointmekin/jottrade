import { defineConfig } from 'vitest/config';
import viteReact from '@vitejs/plugin-react';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    viteReact(),
  ],
  test: {
    globals: true,
    environment: 'node',
    // React's act() only exists in development builds; NODE_ENV=test resolves production.
    env: { NODE_ENV: 'development' },
  },
});
