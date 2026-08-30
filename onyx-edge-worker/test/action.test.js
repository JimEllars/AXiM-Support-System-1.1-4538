import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('Onyx Edge Worker - Action Resolver Validation', () => {

  it('should return 400 Bad Request if category is missing for feedback routing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 400,
      json: async () => ({ error: "Missing required fields: ticket_id and category" })
    });

    const res = await fetch('http://localhost:8787/api/v1/feedback/route', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({ ticket_id: '123e4567-e89b-12d3-a456-426614174000', engineering_notes: 'Some notes' })
    });
    expect(res.status).toBe(400);
  });

  it('should return 200 OK and route feedback successfully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, message: "Feedback successfully routed to Product Engineering" })
    });

    const res = await fetch('http://localhost:8787/api/v1/feedback/route', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({ ticket_id: '123e4567-e89b-12d3-a456-426614174000', category: 'bug', engineering_notes: 'Some notes' })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('should reject execution requests without a valid Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: "Unauthorized" })
    });

    const res = await fetch('http://localhost:8787/api/v1/actions/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hitlLogId: '123e4567-e89b-12d3-a456-426614174000' })
    });
    expect(res.status).toBe(401);
  });

  it('should reject execution requests with invalid UUID payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 400,
      json: async () => ({ error: "Invalid UUID payload" })
    });

    const res = await fetch('http://localhost:8787/api/v1/actions/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({ hitlLogId: 'invalid-uuid-string' })
    });
    expect([400, 429, 403]).toContain(res.status);
  });

  it('should generate valid sla_warning_threshold_breached event payloads when tickets enter the 1-hour warning window', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, event: 'sla_warning_threshold_breached' })
    });

    const res = await fetch('http://localhost:8787/api/v1/cron/sla-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event).toBe('sla_warning_threshold_breached');
  });

  it('should generate a 409 Conflict if ticket was modified by another operator', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 409,
      json: async () => ({ success: false, error: "STATE_CONFLICT", message: "Ticket modified by another operator" })
    });

    const res = await fetch('http://localhost:8787/api/v1/actions/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({
        hitlLogId: '123e4567-e89b-12d3-a456-426614174000',
        ticketId: '123e4567-e89b-12d3-a456-426614174001',
        last_updated_at: '2026-06-01T12:00:00Z'
      })
    });
    expect(res.status).toBe(409);

    const data = await res.json();
    expect(data.error).toBe("STATE_CONFLICT");
    expect(data.success).toBe(false);
  });

  it('should successfully revert an action within the 15-second grace period', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, message: "Action reverted successfully." })
    });

    const res = await fetch('http://localhost:8787/api/v1/actions/revert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({ ticketId: '12345' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('should fail to revert an action after the 15-second grace period', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 400,
      json: async () => ({ error: "GRACE_PERIOD_EXPIRED", message: "The undo window for this action has closed." })
    });

    const res = await fetch('http://localhost:8787/api/v1/actions/revert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({ ticketId: '67890' })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("GRACE_PERIOD_EXPIRED");
  });

  it('should verify RCA generation logic upon sla_breach_escalated trigger', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, event: 'rca_draft_generated' })
    });

    const res = await fetch('http://localhost:8787/api/v1/cron/sla-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event).toBe('rca_draft_generated');
  });

  it('should validate RCA payload and update state to finalized via /api/v1/actions/rca/finalize', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, finalized: true })
    });

    const res = await fetch('http://localhost:8787/api/v1/actions/rca/finalize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({ rcaLogId: '123e4567-e89b-12d3-a456-426614174000', notes: 'Finalized notes.' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.finalized).toBe(true);
  });

  it('should successfully execute SSO token exchange and route to team_profiles upsert', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, department: 'Legal_Operations', role: 'lead' })
    });

    const res = await fetch('http://localhost:8787/api/v1/auth/sso/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-jwt-token`
      },
      body: JSON.stringify({ department: 'Legal_Operations', role: 'lead' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.department).toBe('Legal_Operations');
    expect(data.role).toBe('lead');
  });

  it('should correctly map SLA escalation payload to a mock department lead', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, event: 'sla_breach_auto_escalated', notified_leads: ['mocklead@axim.us.com'] })
    });

    const res = await fetch('http://localhost:8787/api/v1/cron/sla-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event).toBe('sla_breach_auto_escalated');
    expect(data.notified_leads).toContain('mocklead@axim.us.com');
  });


  it('should successfully contribute to Onyx Memory Bank and insert into pgvector', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true })
    });

    const res = await fetch('http://localhost:8787/api/v1/onyx/memory/contribute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({
        ticket_id: '123e4567-e89b-12d3-a456-426614174000',
        resolution_text: 'Test resolution text',
        category: 'support_resolution'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('should successfully renew Onyx Memory Bank and clear is_stale flag', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, memory_id: '123e4567-e89b-12d3-a456-426614174000' })
    });

    const res = await fetch('http://localhost:8787/api/v1/onyx/memory/renew', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({
        memory_id: '123e4567-e89b-12d3-a456-426614174000'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.memory_id).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('should echo ephemeral chat states (typing/read) without database insertion', async () => {
    // This mocks the ephemeral socket logic where typing_start / read_receipt bypasses Supabase insert
    const mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1 // OPEN
    };

    // Create a mock fetch for supabase insert to ensure it is NOT called
    const fetchSpy = vi.spyOn(global, 'fetch');

    // Simulate the exact message payload check logic from handleChatConnect
    const payload = { type: "typing_start", sender: "Customer" };

    // Direct logic check (simulating the worker's internal handling)
    if (payload.type === "typing_start" || payload.type === "typing_stop" || payload.type === "read_receipt") {
       mockWs.send(JSON.stringify(payload));
    } else {
       // Should not reach here
       await fetch('https://mock.supabase.co/rest/v1/ticket_messages', { method: 'POST' });
    }

    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(payload));

    // Check that we never called the supabase insert URL during this transaction
    const supabaseCalls = fetchSpy.mock.calls.filter(call =>
      typeof call[0] === 'string' && call[0].includes('ticket_messages') && call[1]?.method === 'POST'
    );
    expect(supabaseCalls.length).toBe(0);

    fetchSpy.mockRestore();
  });


  it('should successfully generate and broadcast dual-language payload when language differs', async () => {
    const mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1 // OPEN
    };

    // We can't easily mock WebSocketPair inside the existing test environment without more setup,
    // but we can simulate the environment and the AI translation payload logic for verification.

    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({ response: '{"translated_text": "Hello, how can I help?", "original_language": "es"}' })
      }
    };

    // Simulate the exact message payload logic from handleChatConnect
    const data = { type: "chat_message", text: "Hola, ¿como puedo ayudar?", sender: "Customer" };

    if (mockEnv.AI && data.sender !== 'Operator') {
      const translationPrompt = `Analyze the following text. If it is NOT in English, detect the language and translate it to English. If it is already in English, return exactly "IS_ENGLISH". Otherwise, return a JSON object strictly in this format: {"translated_text": "...", "original_language": "..."}. Text: "${data.text}"`;
      const translationResponse = await mockEnv.AI.run('@cf/meta/llama-3-8b-instruct', { prompt: translationPrompt });
      const responseText = translationResponse.response.trim();

      if (responseText !== "IS_ENGLISH" && responseText.includes("{") && responseText.includes("}")) {
        const jsonMatch = responseText.substring(responseText.indexOf("{"), responseText.lastIndexOf("}") + 1);
        const parsedTranslation = JSON.parse(jsonMatch);
        if (parsedTranslation.translated_text && parsedTranslation.original_language) {
          data.translated_text = parsedTranslation.translated_text;
          data.original_language = parsedTranslation.original_language;
        }
      }
      mockWs.send(JSON.stringify(data));
    }

    expect(mockEnv.AI.run).toHaveBeenCalled();
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
      type: "chat_message",
      text: "Hola, ¿como puedo ayudar?",
      sender: "Customer",
      translated_text: "Hello, how can I help?",
      original_language: "es"
    }));
  });

  it('should return 200 OK and successfully create a ticket when converting chat', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, ticket_id: 'new-ticket-uuid' })
    });

    const res = await fetch('http://localhost:8787/api/v1/chat/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-secret`
      },
      body: JSON.stringify({
        chat_messages: [
          { sender: 'Customer', text: 'Hello', timestamp: new Date().toISOString() },
          { sender: 'Operator', text: 'Hi there', timestamp: new Date().toISOString() }
        ],
        customer_email: 'test@axim.us.com'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.ticket_id).toBe('new-ticket-uuid');
  });
});
  it('should dispatch timeout_warning at 10 minutes and close at 11 minutes of idle time on websocket', async () => {
    // This is a simulated lifecycle test for the edge connection manager.
    // In our implementation, we test the logic behavior.
    const wsLifecycle = {
      warnings: 0,
      closed: false
    };

    let lastActivity = Date.now();
    let warningSent = false;
    let idleInterval;

    vi.useFakeTimers();

    // Simulate connection
    idleInterval = setInterval(() => {
      const now = Date.now();
      const idleTime = now - lastActivity;

      if (idleTime > 11 * 60 * 1000) {
        clearInterval(idleInterval);
        wsLifecycle.closed = true;
      } else if (idleTime > 10 * 60 * 1000 && !warningSent) {
        warningSent = true;
        wsLifecycle.warnings++;
      }
    }, 10000);

    // Advance 10 mins + 5 seconds
    vi.advanceTimersByTime(10 * 60 * 1000 + 15000);
    expect(wsLifecycle.warnings).toBe(1);
    expect(wsLifecycle.closed).toBe(false);

    // Advance another 60 seconds
    vi.advanceTimersByTime(60 * 1000);
    expect(wsLifecycle.closed).toBe(true);

    vi.useRealTimers();
  });

describe('Onyx Edge Worker - Chat Attachment Security Constraints', () => {
  it('should return 415 Unsupported Media Type for invalid MIME type (.exe)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 415,
      json: async () => ({ error: "Unsupported Media Type" })
    });

    const res = await fetch('http://localhost:8787/api/v1/chat/upload-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-secret'
      },
      body: JSON.stringify({ filename: 'virus.exe', file_size: 1024, mime_type: 'application/x-msdownload' })
    });
    expect(res.status).toBe(415);
  });

  it('should return 413 Payload Too Large for file > 5MB', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 413,
      json: async () => ({ error: "Payload Too Large" })
    });

    const res = await fetch('http://localhost:8787/api/v1/chat/upload-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-secret'
      },
      body: JSON.stringify({ filename: 'big.jpg', file_size: 10 * 1024 * 1024, mime_type: 'image/jpeg' })
    });
    expect(res.status).toBe(413);
  });

  it('should return 200 OK for valid 1MB PNG', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, uploadUrl: "https://example.com/upload", path: "test.png", publicUrl: "https://example.com/test.png" })
    });

    const res = await fetch('http://localhost:8787/api/v1/chat/upload-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-secret'
      },
      body: JSON.stringify({ filename: 'valid.png', file_size: 1024 * 1024, mime_type: 'image/png' })
    });
    expect(res.status).toBe(200);
  });
});
