import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // The trust-boundary suite imports the real worker module (~9k lines) and
    // drives worker.fetch(), which pulls in WebCrypto and Supabase per case.
    // The 5s default timed out under load and reported false reds.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
