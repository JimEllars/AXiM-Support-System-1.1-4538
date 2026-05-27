import re

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    text = f.read()

# Pattern for the block we want to move
block_pattern = r'''\s*const supabase = createClient\(
\s*env\.SUPABASE_URL,
\s*env\.SUPABASE_SERVICE_ROLE_KEY,?
\s*\);

\s*const logCtx = createLogContext\(request\);
\s*logToEvents\(supabase, logCtx, "performance_metric", "Request start", \{
\s*headers: request\.headers,
\s*\}\);
\s*const startTime = Date\.now\(\);'''

# There is a variation without startTime for handleHealthCheck
health_block_pattern = r'''\s*const supabase = createClient\(
\s*env\.SUPABASE_URL,
\s*env\.SUPABASE_SERVICE_ROLE_KEY,?
\s*\);

\s*const logCtx = createLogContext\(request\);
\s*logToEvents\(supabase, logCtx, "performance_metric", "Request start", \{ headers: request\.headers \}\);'''

# Replace all occurrences of these blocks with empty string
text = re.sub(r'\s*const supabase = createClient\(\s*env\.SUPABASE_URL,\s*env\.SUPABASE_SERVICE_ROLE_KEY,?\s*\);', '', text)
text = re.sub(r'\s*const logCtx = createLogContext\(request\);', '', text)
text = re.sub(r'\s*logToEvents\(supabase, logCtx, "performance_metric", "Request start", \{\s*headers: request\.headers,?\s*\}\);', '', text)
text = re.sub(r'\s*const startTime = Date\.now\(\);', '', text)

# Now, inject the block at the beginning of each handler
handlers = [
    "handleHealthCheck",
    "handleTicketIngestion",
    "handleVectorSearch",
    "handleBatchTriage",
    "handleWebhookIntake",
    "handleExecuteAction",
    "handleOnyxBridgeStream",
    "handleGenerateSuggestion"
]

injection = """
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logCtx = createLogContext(request);
  logToEvents(supabase, logCtx, "performance_metric", "Request start", { headers: request.headers });
  const startTime = Date.now();
"""

for handler in handlers:
    pattern = r'(async function ' + handler + r'\([^)]+\)(?::\s*Promise<Response>)?\s*\{)'
    text = re.sub(pattern, r'\1' + injection, text)

with open('onyx-edge-worker/src/index.ts', 'w') as f:
    f.write(text)
