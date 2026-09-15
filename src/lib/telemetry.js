
let timeoutId = null;
const EVENT_QUEUE = [];

const scheduleFlush = () => {
  if (timeoutId) {
    if (window.cancelIdleCallback) window.cancelIdleCallback(timeoutId);
    else clearTimeout(timeoutId);
  }

  if (window.requestIdleCallback) {
    timeoutId = window.requestIdleCallback(() => flushQueue(), { timeout: 2000 });
  } else {
    timeoutId = setTimeout(() => flushQueue(), 1000);
  }
};

export function trackEvent(eventName, payload) {
  EVENT_QUEUE.push({ event: eventName, payload, timestamp: new Date().toISOString() });
  scheduleFlush();
}

const flushQueue = async () => {
  if (EVENT_QUEUE.length === 0) return;
  const events = [...EVENT_QUEUE];
  EVENT_QUEUE.length = 0;

  try {
    const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || import.meta.env.VITE_ONYX_WORKER_URL || '';
    if (!workerUrl) return;

    // Send each event without blocking
    events.forEach(eventObj => {
      const data = JSON.stringify(eventObj);
      const url = `${workerUrl}/api/v1/telemetry/event`;

      const sendRequest = async () => {
        try {
          if (navigator.sendBeacon) {
            navigator.sendBeacon(url, data);
          } else {
            await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: data,
              keepalive: true
            });
          }
        } catch (e) {
          console.debug("Telemetry send failed, caught to prevent blocking:", e);
        }
      };

      sendRequest();
    });
  } catch (e) {
    console.debug("Telemetry flush error", e);
  }
};

export function trackMetric(metricName, value, tags = {}) {
  trackEvent('metric', { name: metricName, value, tags });
}

export function logError(error, context = {}) {
  trackEvent('error', {
    message: error?.message || String(error),
    stack: error?.stack,
    context
  });
}
