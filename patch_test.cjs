const fs = require('fs');
let code = fs.readFileSync('onyx-edge-worker/test/intake.test.js', 'utf8');
code = code.replace(/}\);\s*$/, `  it('should reject external webhooks missing a valid HMAC signature', async () => {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${MOCK_SECRET}\`
        // Missing 'x-axim-signature' and missing 'X-Axim-Default-Source'
      },
      body: JSON.stringify({ subject: 'Test', description: 'Test desc', customer_email: 'test@example.com' })
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Invalid Webhook Signature');
  });
});
`);
fs.writeFileSync('onyx-edge-worker/test/intake.test.js', code);
