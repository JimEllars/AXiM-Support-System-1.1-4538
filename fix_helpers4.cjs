const fs = require('fs');

let code = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf8');

code = code.replace(/function createLogContext\(request: Request\) \{/g, `function createLogContext(request: Request) {`);

code = code.replace(/requestId: request\.headers\.get\("cf-ray"\) \|\| \`req-\$\{Date\.now\(\)\}\`,/g, `requestId: request.headers.get("cf-ray") || \`req-\${Date.now()}\`,
    edge_colo: request.headers.get("cf-ray")?.split("-")[1] || "DEV",`);

code = code.replace(/function validateAttachment\(file: any\) \{/g, `function validateAttachment(file: any) {`);
code = code.replace(/return \{ valid: true \};/g, `return { valid: true, error: "" };`);


code = code.replace(/async function handleStaleTicketSweep\(env: Env, ctx: any\) \{/g, `async function handleStaleTicketSweep(env: Env) {`);


fs.writeFileSync('onyx-edge-worker/src/index.ts', code);
