import fs from 'fs';

let code = fs.readFileSync('onyx-edge-worker/test/action.test.js', 'utf8');

const testToAdd = `
  it('should return 200 OK and successfully create a ticket when converting chat', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, ticket_id: 'new-ticket-uuid' })
    });

    const res = await fetch('http://localhost:8787/api/v1/chat/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer test-secret\`
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
});`;

code = code.replace(/}\);\s*$/, testToAdd);

fs.writeFileSync('onyx-edge-worker/test/action.test.js', code);
console.log('patched test file');
