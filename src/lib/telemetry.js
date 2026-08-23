export function trackEvent(eventName, payload) {
  try {
    const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || import.meta.env.VITE_ONYX_WORKER_URL || '';
    if (!workerUrl) return;

    fetch(`${workerUrl}/api/v1/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: eventName,
        payload,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {});
  } catch (e) {
    // Ignore telemetry errors
  }
}
