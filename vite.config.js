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
    // ----------------------------------------------------------------
    // The frontend test gate: why this configuration looks like this.
    // ----------------------------------------------------------------
    //
    // Vitest hard-codes a 60s wait for a forked worker to report "started"
    // (`START_TIMEOUT = 6e4` in vitest/dist/chunks/cli-api; Vitest 4 removed
    // `poolOptions`, so there is no config knob to raise it). A fork reports
    // "started" only *after* `worker.setup()` -> `setupBaseEnvironment()` ->
    // `environment.setup()` -> `await import('happy-dom')` — verified in
    // vitest@4.1.11: `dist/workers/forks.js` sets `setup: setupBaseEnvironment`
    // and `dist/chunks/init.k9zZ9sLh.js` sends `type: "started"` only once that
    // resolves.
    //
    // That import is the dominant cost of a fork boot: happy-dom is 19 MB across
    // 609 ESM files and measures 15.5s on a 2 vCPU box (`environment 15.51s` on
    // one DOM file) against ~1ms for the node environment. Window construction
    // adds roughly 8s per additional file.
    //
    // The failure mode is therefore a fork whose start handshake exceeds 60s,
    // and on a loaded 2 vCPU box it does happen:
    //   "[vitest-pool]: Failed to start forks worker ... Timeout waiting for
    //    worker to respond"
    //
    // Two changes reduce how often that window is open:
    //   - `fileParallelism: false` (phase 162) stops five forks contending for
    //     two cores at once.
    //   - `maxWorkers: 1` (phase 163) makes that single-fork intent explicit
    //     instead of leaving it to `nproc`.
    //
    // `isolate: false` was tried and rejected: it cuts wall time (175s -> ~115s)
    // but batches files into one fork, so a batch containing a component suite
    // puts the node suites behind `import('happy-dom')` in the same start
    // handshake — and a lost handshake then loses every file instead of one.
    //
    // Also deliberately NOT changed: a uniform happy-dom environment, which
    // collapses the run to one handshake that then has to build a Window for
    // every file (`environment 40.16s`). Opt-in keeps the three pure-logic
    // suites cheap and confines happy-dom to the two files that need it.
    //
    // Honest limitation: `await import('happy-dom')` inside a hard-coded 60s
    // budget cannot be made reliable on a 2 vCPU box with no swap under real
    // load, and nothing in this file can shrink it. CI (`ubuntu-latest`,
    // 4 vCPU / 16 GB) is the authority for this gate. If this ever needs to be
    // reliable on small runners, the fix is a lighter DOM: `jsdom` opens in a
    // fraction of the 609 files happy-dom parses, and the two component suites
    // are the only consumers.
    //
    // The gate is loud when this happens, not silently green: unhandled pool
    // errors set `process.exitCode = 1` (vitest/dist/chunks/cli-api,
    // `if (errors.length && !this.config.dangerouslyIgnoreUnhandledErrors)`), so
    // CI fails. What phase 162 saw — "4 files / 20 tests passed" with
    // OnyxInvestigationPanel.test.jsx missing — was a misleading *count* on a
    // run that did exit non-zero, not a false green.
    //
    // Because `isolate: false` shares one process across the suite, nothing may
    // leak module-level state. `test_onyx_panel.test.jsx` used to assign
    // `global.fetch` at import time; it now scopes the stub to
    // beforeEach/afterEach.
    environment: 'node',
    // Not the reason for the config above — a plain win on Window construction.
    // The suites render through @testing-library/react in Node and never
    // evaluate a <script>, load a CSS file or navigate an iframe, so happy-dom
    // can skip all four.
    environmentOptions: {
      happyDOM: {
        settings: {
          disableJavaScriptEvaluation: true,
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          disableIframePageLoading: true,
        },
      },
    },
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
    fileParallelism: false,
    // One fork at a time. Phase 161 set `maxWorkers: 2`; two forks booting
    // happy-dom on two cores is what started the 60s race in the first place.
    maxWorkers: 1,
    minWorkers: 1,
    // `isolate` is left at its default (`true`) after testing `false`:
    // `isolate: false` cuts wall time (175s -> ~115s) but it batches files into
    // one fork, and a batch containing a component suite then makes the *node*
    // suites wait behind `import('happy-dom')` in the same start handshake. When
    // that handshake loses, the run loses every file instead of one. Keeping the
    // default confines happy-dom's cost to the two component forks.
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