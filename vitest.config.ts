import { configDefaults, defineConfig } from 'vitest/config';
import viteReact from '@vitejs/plugin-react';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    // Match the app build, so tests see the same compiler memoization.
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    // e2e/ holds the Playwright suite; `npm run verify` runs it.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // React's act() only exists in development builds; NODE_ENV=test resolves production.
    env: { NODE_ENV: 'development' },
  },
});
