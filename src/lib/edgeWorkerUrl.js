export function getEdgeWorkerUrl() {
  return import.meta.env.VITE_EDGE_WORKER_URL || import.meta.env.VITE_ONYX_WORKER_URL || 'http://localhost:8787';
}
