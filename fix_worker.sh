#!/bin/bash
# We'll use a python script to refactor the edge worker code
cat << 'PYEOF' > refactor.py
import re

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    content = f.read()

# 1. Fix the router registration: Move /health route to right before the default fallback
health_route = """    if (url.pathname === '/health' || url.pathname === '/api/v1/health') {
        return handleHealthCheck(env, request);
    }
"""

content = content.replace(health_route, "")

fallback_idx = content.find("// Default route (ticket ingestion)")
if fallback_idx != -1:
    content = content[:fallback_idx] + health_route + "\n    " + content[fallback_idx:]


# 2. Universal Telemetry Enforcement
# Replace console.error + logErr with just logErr properly
content = re.sub(r'console\.error\(\'Error:\',\s*([a-zA-Z0-9_]+)\);\s*try\s*\{\s*logErr\(supabase,\s*logCtx,\s*\1\);\s*\}\s*catch\s*\([^\)]*\)\s*\{\}', r'logErr(supabase, logCtx, \1);', content)

# There are some other variations of console.error in the code:
content = re.sub(r'console\.error\(\"Embedding API error:\", await embedRes\.text\(\)\);\s*throw new Error\(\"Failed to fetch embedding from Core\"\);', r'logErr(supabase, logCtx, new Error("Embedding API error: " + await embedRes.text()));\n                throw new Error("Failed to fetch embedding from Core");', content)
content = re.sub(r'console\.error\(\"Error fetching embedding:\", err\);\s*throw new Error\(\"Embedding generation failed\"\);', r'logErr(supabase, logCtx, err);\n            throw new Error("Embedding generation failed");', content)
content = re.sub(r'if \(uploadError\) console\.error\(\"Error uploading attachment:\", uploadError\);', r'if (uploadError) logErr(supabase, logCtx, uploadError);', content)
content = re.sub(r'if \(messageError\) console\.error\(\"Error inserting Onyx deflection message:\", messageError\);', r'if (messageError) logErr(supabase, logCtx, messageError);', content)

content = re.sub(r'console\.error\(\'SSE Error:\', e\);', r'logErr(supabase, logCtx, e);', content)

content = re.sub(r'console\.error\(\"Anthropic Error:\", await anthropicRes\.text\(\)\);\s*throw new Error\(\"Anthropic API returned non-OK status\.\"\);', r'logErr(supabase, logCtx, new Error("Anthropic Error: " + await anthropicRes.text()));\n                    throw new Error("Anthropic API returned non-OK status.");', content)
content = re.sub(r'console\.error\(\"LLM Generation Error or Timeout:\", err\.message\);', r'logErr(supabase, logCtx, err);', content)

# logEnd enforcement
# Right now it's: try { logEnd(supabase, logCtx, startTime); } catch(e){} return new Response(...
content = re.sub(r'try\s*\{\s*logEnd\(supabase,\s*logCtx,\s*startTime\);\s*\}\s*catch\s*\([^\)]*\)\s*\{\}', r'logEnd(supabase, logCtx, startTime);', content)

# 4. Supabase Client Optimization
# The user wants createClient to only be called once per request cycle at the top of each route handler.
# Currently some route handlers have it, and it might be called multiple times.
# We will do this carefully.

with open('onyx-edge-worker/src/index.ts', 'w') as f:
    f.write(content)

PYEOF
python3 refactor.py
