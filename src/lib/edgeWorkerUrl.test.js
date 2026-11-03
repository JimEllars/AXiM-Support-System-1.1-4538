/** @vitest-environment happy-dom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getEdgeWorkerUrl } from './edgeWorkerUrl';

/**
 * Phase 160 — every frontend call builds its URL from this function, so a
 * regression here breaks all edge traffic at once (a trailing slash produced
 * `//api/v1/...` on some proxies and a 404 on others).
 */
describe('getEdgeWorkerUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the configured worker URL', () => {
    vi.stubEnv('VITE_EDGE_WORKER_URL', 'https://edge.axim.test');
    expect(getEdgeWorkerUrl()).toBe('https://edge.axim.test');
  });

  it('strips trailing slashes so paths are not doubled up', () => {
    vi.stubEnv('VITE_EDGE_WORKER_URL', 'https://edge.axim.test///');
    expect(getEdgeWorkerUrl()).toBe('https://edge.axim.test');
  });

  it('falls back to the same-origin /api proxy off localhost', () => {
    vi.stubEnv('VITE_EDGE_WORKER_URL', '');
    const original = window.location;
    try {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { hostname: 'axim.us.com', origin: 'https://axim.us.com' },
      });
      expect(getEdgeWorkerUrl()).toBe('https://axim.us.com/api');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('points at the local wrangler port during development', () => {
    vi.stubEnv('VITE_EDGE_WORKER_URL', '');
    const original = window.location;
    try {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { hostname: 'localhost', origin: 'http://localhost:5173' },
      });
      expect(getEdgeWorkerUrl()).toBe('http://localhost:8787');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
