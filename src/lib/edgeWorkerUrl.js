export function getEdgeWorkerUrl() {
  if (import.meta.env.VITE_EDGE_WORKER_URL) {
    return import.meta.env.VITE_EDGE_WORKER_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:8787';
}
