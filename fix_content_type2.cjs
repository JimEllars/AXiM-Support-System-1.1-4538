const fs = require('fs');
let code = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf8');

code = code.replace(/'X-Content-Type-Options': 'nosniff',\s*\.\.\.getCorsHeaders\(env, request\)/g, `...getCorsHeaders(env, request)`);

fs.writeFileSync('onyx-edge-worker/src/index.ts', code);
