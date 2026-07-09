import re

# Patch onyx-edge-worker/src/index.ts
with open('onyx-edge-worker/src/index.ts', 'r') as f:
    content = f.read()

pattern = re.compile(r'    // --- LIVE ONYX INVESTIGATION STREAM \(SSE Proxy\) ---.*?    if \(url\.pathname === "/api/v1/onyx-bridge/stream" && request\.method === "POST"\) \{.*?\n    \}\n', re.DOTALL)

new_block = """    // --- LIVE ONYX INVESTIGATION STREAM (SSE Proxy) ---
    if (url.pathname === "/api/v1/onyx-bridge/stream" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) return new Response(JSON.stringify({ error: "UNAUTHORIZED_STREAM" }), { status: 401, headers: getCorsHeaders(env, request) });

      const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

      try {
        const body: any = await request.json();
        const prompt = `You are Onyx Mk3, an internal enterprise AI. Perform a rapid, live triage investigation of the following support ticket. Stream your thought process step-by-step using clear bullet points.\\n\\nSubject: ${body.subject}\\nDescription: ${body.description}`;

        if (env.DEEPSEEK_API_KEY) {
          // Primary Provider: Deepseek
          const deepseekRes = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
              model: "deepseek-chat",
              max_tokens: 400,
              messages: [{ role: "user", content: prompt }],
              stream: true
            }),
          });
          if (!deepseekRes.ok) throw new Error("Deepseek streaming ingress dropped.");
          return new Response(deepseekRes.body, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", ...getCorsHeaders(env, request) }
          });
        } else if (env.ANTHROPIC_API_KEY) {
          // Fallback Provider: Anthropic Claude
          const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: "claude-3-haiku-20240307",
              max_tokens: 400,
              messages: [{ role: "user", content: prompt }],
              stream: true
            }),
          });
          if (!anthropicRes.ok) throw new Error("Fallback Anthropic streaming ingress dropped.");
          return new Response(anthropicRes.body, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", ...getCorsHeaders(env, request) }
          });
        } else {
          throw new Error("No upstream AI environment bindings present on Cloudflare Edge.");
        }
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: getCorsHeaders(env, request) });
      }
    }
"""

if not pattern.search(content):
    print("Could not find the target block in onyx-edge-worker/src/index.ts")
else:
    new_content = pattern.sub(new_block.replace('\\', '\\\\'), content, count=1)
    # The replacement replaces \n with \\n if we don't escape it carefully.
    # Actually wait, using replace is better to avoid regex substitution issues.

    with open('onyx-edge-worker/src/index.ts', 'w') as f:
        f.write(new_content)
    print("Patched onyx-edge-worker/src/index.ts")
