export function trackEvent(eventName, payload) {
  try {
    const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || import.meta.env.VITE_ONYX_WORKER_URL || '';
    if (!workerUrl) return;

    const data = JSON.stringify({
      event: eventName,
      payload,
      timestamp: new Date().toISOString()
    });

    const url = `${workerUrl}/api/v1/telemetry/event`;

    if (navigator.sendBeacon) {
       navigator.sendBeacon(url, data);
    } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data,
          keepalive: true
        }).catch(() => {});
    }
  } catch (e) {
    // Ignore telemetry errors
  }
}
