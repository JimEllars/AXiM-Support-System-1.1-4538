import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Phase 160: without an explicit `test.include`, vitest's default glob swept
  // `onyx-edge-worker/test/**` into the frontend run. `npm test` reported
  // "17 files / 124 tests passed" while the only frontend test in the repo was
  // `test_onyx_panel.test.jsx` — the other 16 files were the edge worker's
  // suites, already run by the `edge-worker` CI job. That made the frontend job
  // look covered when it was not. The worker directory is now excluded and the
  // frontend job runs frontend code only.
  test: {
    // Node by default so the pure-logic suites stay fast; component tests opt
    // into happy-dom with a `@vitest-environment` docblock.
    environment: 'node',
    globals: true,
    // React resolves its development build from the ambient NODE_ENV at import
    // time. Without this, a shell that already exports NODE_ENV=production
    // loads react.production.min.js and every `render()` throws
    // "act(...) is not supported in production builds of React".
    env: { NODE_ENV: 'test' },
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      '*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    exclude: ['node_modules/**', 'dist/**', 'onyx-edge-worker/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    historyApiFallback: true,
  },
   build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        if (warning.code === 'EVAL') return;
        if (warning.message.includes('is dynamically imported by')) return;
        warn(warning);
      }
    }
  },
  css: {
    postcss: {
      plugins: []
    }
  }
});