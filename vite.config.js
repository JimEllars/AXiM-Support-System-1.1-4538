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
    // Phase 161: vitest hard-codes a 60s wait for a forked worker to report
    // "started" (START_TIMEOUT in vitest/dist/chunks/cli-api). Each fork boots
    // its own module graph — react-dom, @testing-library/react and happy-dom
    // for the component suites — which costs ~35s per fork on a 2 vCPU runner.
    // The default fork count is derived from the CPU count, so four files could
    // land in four forks at once and the last one missed its deadline:
    //   "[vitest-pool]: Failed to start forks worker ... Timeout waiting for
    //    worker to respond"
    // The suite was red on a 2 vCPU box while passing serially. Two workers
    // keeps a ceiling on that contention without giving up parallelism.
    maxWorkers: 2,
    minWorkers: 1,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    historyApiFallback: true,
  },
   // Phase 161: this block used to be `css: { postcss: { plugins: [] } }`.
  // Supplying an explicit `plugins` array replaces Vite's postcss.config.js
  // lookup, so `tailwindcss` and `autoprefixer` never ran: every production
  // build emitted `@tailwind base; @tailwind components; @tailwind utilities;`
  // verbatim (0.78 kB of CSS) and the app shipped completely unstyled. It hid
  // for so long because the only stylesheet in the bundle was a 2.03 MB vendor
  // import that made the output look plausible. Removing the override lets
  // postcss.config.js do its job.
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
  // No `css.postcss` override: an explicit `plugins` array (even an empty one)
  // bypasses Vite's postcss.config.js lookup, and postcss.config.js is what
  // wires up tailwindcss + autoprefixer.
});