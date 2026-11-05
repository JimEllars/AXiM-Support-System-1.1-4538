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
    // Phase 162: vitest hard-codes a 60s wait for a forked worker to report
    // "started" (START_TIMEOUT = 6e4 in vitest/dist/chunks/cli-api). A fork
    // reports "started" only after its test environment module is imported, and
    // for the component suites that import is `happy-dom` — 14 MB across 609
    // ESM files, measured at 21s cold on a 2 vCPU box. Phase 161 capped that at
    // two concurrent forks, which was still enough contention to blow the
    // deadline and report:
    //   "[vitest-pool]: Failed to start forks worker ... Timeout waiting for
    //    worker to respond"
    // while the tests themselves pass. There are five files and 24 tests here;
    // cross-file parallelism buys seconds of test time and costs a 60s startup
    // race. Serialise the files so the gate is deterministic on any runner.
    fileParallelism: false,
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