const fs = require('fs');
const file = './onyx-edge-worker/src/index.ts';
let data = fs.readFileSync(file, 'utf8');

// Ensure OPTIONS returns 204
data = data.replace(
  /if \(request\.method === "OPTIONS"\) \{\s*return new Response\(null, \{\s*headers: \{\s*\.\.\.getCorsHeaders\(env, request\),\s*"Access-Control-Allow-Methods": "POST, GET, OPTIONS",\s*"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Idempotency-Key, X-Axim-Network-Key, cf-turnstile-response",\s*"Access-Control-Max-Age": "86400"\s*\}\s*\}\);\s*\}/g,
  `if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...getCorsHeaders(env, request),
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Idempotency-Key, X-Axim-Network-Key, cf-turnstile-response",
          "Access-Control-Max-Age": "86400"
        },
      });
    }`
);

// Second replacement
data = data.replace(
  /if \(request\.method === "OPTIONS"\) return new Response\(null, \{ headers: cors \}\);/g,
  `if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      }
    });
  }`
);

fs.writeFileSync(file, data, 'utf8');
