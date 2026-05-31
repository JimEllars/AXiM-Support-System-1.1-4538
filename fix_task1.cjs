const fs = require('fs');
let code = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf8');

// Remove globals
code = code.replace(/declare var supabase: any;\n/g, '');
code = code.replace(/declare var logCtx: any;\n/g, '');
code = code.replace(/declare var startTime: number;\n/g, '');

const preamble = `
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logCtx = createLogContext(request);
  const startTime = Date.now();
  await logToEvents(supabase, logCtx, 'performance_metric', 'Request start', { headers: request.headers });
`;

// Function: handleTicketResolved
let fnStart = code.indexOf('async function handleTicketResolved(');
if (fnStart !== -1) {
    let braceStart = code.indexOf('{', fnStart) + 1;
    code = code.slice(0, braceStart) + preamble + code.slice(braceStart);
}

// Function: handleToolCommand
fnStart = code.indexOf('async function handleToolCommand(');
if (fnStart !== -1) {
    let braceStart = code.indexOf('{', fnStart) + 1;
    code = code.slice(0, braceStart) + preamble + code.slice(braceStart);
}

// Function: handleAutoDraft
fnStart = code.indexOf('async function handleAutoDraft(');
if (fnStart !== -1) {
    let braceStart = code.indexOf('{', fnStart) + 1;
    code = code.slice(0, braceStart) + preamble + code.slice(braceStart);
}

// Add logEnd to handleVectorSearch
let vectorSearchStart = code.indexOf('async function handleVectorSearch(');
let endSearchStr = `return new Response(JSON.stringify(articles), {
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(env, request),
      },
    });`;
let endSearchIdx = code.indexOf(endSearchStr, vectorSearchStart);
if (endSearchIdx !== -1) {
    code = code.slice(0, endSearchIdx) + `logEnd(supabase, logCtx, startTime);\n    ` + code.slice(endSearchIdx);
}

fs.writeFileSync('onyx-edge-worker/src/index.ts', code);
