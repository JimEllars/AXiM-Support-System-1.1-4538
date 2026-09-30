const fs = require('fs');

let code = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf8');

const logContextFunc = `function createLogContext(request: Request) {
  return {
    requestId: request.headers.get("cf-ray") || \`req-\${Date.now()}\`,
    method: request.method,
    url: request.url,
  };
}

async function logToEvents(supabase: any, context: any, type: string, message: string, data?: any) {
  try {
    await supabase.from("events_ax2024").insert({
      type: type,
      payload: { ...context, message, data }
    });
  } catch (err) {
    console.error("logToEvents failed", err);
  }
}

function logErr(supabase: any, context: any, error: any, ctx: any) {
  console.error("logErr:", error);
}

function logEnd(supabase: any, context: any, data: any, ctx: any) {
}

function validateAttachment(file: any) {
   return { valid: true };
}

async function handleStaleTicketSweep(env: Env, ctx: any) {
}
`;

if (!code.includes('function createLogContext(request: Request)')) {
    code = code.replace(/import \{ z \} from "zod";/, `import { z } from "zod";\n` + logContextFunc);
}

fs.writeFileSync('onyx-edge-worker/src/index.ts', code);
