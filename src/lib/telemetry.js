
let timeoutId = null;
const EVENT_QUEUE = [];

const scheduleFlush = () => {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (EVENT_QUEUE.length >= 10) {
    flushQueue();
  } else {
    timeoutId = setTimeout(() => flushQueue(), 15000); // 15 seconds
  }
};

export function trackEvent(eventName, payload) {
  EVENT_QUEUE.push({ event: eventName, payload, timestamp: new Date().toISOString() });

  // Save to sessionStorage as a transient ring buffer up to 50 items
  try {
     let sessionBuffer = JSON.parse(sessionStorage.getItem('telemetry_buffer') || '[]');
     sessionBuffer.push({ event: eventName, payload, timestamp: new Date().toISOString() });
     if (sessionBuffer.length > 50) {
        sessionBuffer = sessionBuffer.slice(sessionBuffer.length - 50);
     }
     sessionStorage.setItem('telemetry_buffer', JSON.stringify(sessionBuffer));
  } catch(e) {}

  scheduleFlush();
}

const flushQueue = async () => {
  let sessionBuffer = [];
  try {
      sessionBuffer = JSON.parse(sessionStorage.getItem('telemetry_buffer') || '[]');
  } catch (e) {}

  if (EVENT_QUEUE.length === 0 && sessionBuffer.length === 0) return;

  // Combine memory queue and session buffer
  const combined = [...EVENT_QUEUE];
  for (const item of sessionBuffer) {
      if (!combined.some(e => JSON.stringify(e) === JSON.stringify(item))) {
          combined.push(item);
      }
  }

  EVENT_QUEUE.length = 0;

  try {
    const workerUrl = import.meta.env.VITE_EDGE_WORKER_URL || import.meta.env.VITE_ONYX_WORKER_URL || '';
    if (!workerUrl) return;

    const data = JSON.stringify(combined);
    const url = `${workerUrl}/api/v1/telemetry/event`;

    let success = false;
    try {
      if (navigator.sendBeacon) {
        success = navigator.sendBeacon(url, data);
      } else {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data,
          keepalive: true
        });
        success = res.ok || res.status === 202;
      }

      if (success) {
         sessionStorage.removeItem('telemetry_buffer');
      }
    } catch (e) {
      console.debug("Telemetry batch send failed, caught to prevent blocking:", e);
    }
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
