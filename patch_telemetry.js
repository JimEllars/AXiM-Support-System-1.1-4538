<<<<<<< SEARCH
export function logError(error, context = {}) {
  trackEvent('error', {
    message: error?.message || String(error),
    stack: error?.stack,
    context
  });
}
=======
export function logError(error, context = {}) {
  trackEvent('error', {
    message: error?.message || String(error),
    stack: error?.stack,
    context
  });
}

export function trackAiTelemetry({ ticketId, actionType, latencyMs, modelProvider, promptTokens, completionTokens, isCurated, metadata }) {
  trackEvent('ai_telemetry', {
    ticket_id: ticketId,
    action_type: actionType,
    latency_ms: latencyMs,
    model_provider: modelProvider,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    is_curated: isCurated,
    metadata
  });
}
>>>>>>> REPLACE
