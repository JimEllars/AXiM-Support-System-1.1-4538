export function sanitizePayload(payload) {
  if (typeof payload !== 'object' || payload === null) return payload;

  const sanitized = Array.isArray(payload) ? [] : {};

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string') {
      // Basic sanitization to strip HTML/scripts
      sanitized[key] = value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizePayload(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
