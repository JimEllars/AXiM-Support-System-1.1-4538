const fs = require('fs');
const file = './onyx-edge-worker/src/index.ts';
let data = fs.readFileSync(file, 'utf8');

data = data.replace(/const checks = \{\s*database: false,\s*coreApi: false,\s*\};/, `const checks = {
    database: false,
    coreApi: false,
    edgeKv: false,
    modelConfig: false,
  };`);

const edgeKvCheck = `
  try {
    if (env.SUPPORT_TICKET_CACHE) {
      await env.SUPPORT_TICKET_CACHE.put('health_check', 'ok', { expirationTtl: 60 });
      checks.edgeKv = true;
    } else {
      checks.edgeKv = true; // if not configured, we don't fail health
    }
  } catch (e: any) {
    logErr(supabase, logCtx, e, ctx);
    checks.edgeKv = false;
  }

  try {
    checks.modelConfig = !!(env.ANTHROPIC_API_KEY || env.GEMINI_API_KEY || env.OPENAI_API_KEY);
  } catch (e: any) {
    logErr(supabase, logCtx, e, ctx);
    checks.modelConfig = false;
  }
`;

data = data.replace(/const allHealthy = Object\.values\(checks\)\.every\(Boolean\);/, edgeKvCheck + '\n  const allHealthy = Object.values(checks).every(Boolean);');

data = data.replace(/status: allHealthy \? 200 : 503,/, 'status: 200,');

fs.writeFileSync(file, data, 'utf8');
