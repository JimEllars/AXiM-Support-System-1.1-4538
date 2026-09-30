const fs = require('fs');
let code = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf8');

// The error is TS2783: 'X-Content-Type-Options' is specified more than once.
code = code.replace(/"X-Content-Type-Options": "nosniff",\s*"X-Content-Type-Options": "nosniff"/g, `"X-Content-Type-Options": "nosniff"`);

fs.writeFileSync('onyx-edge-worker/src/index.ts', code);
