sed -i.bak -e '/async function handleSandboxResolution(request: Request, env: Env, ctx: any): Promise<Response> {/c\
async function handleSandboxResolution(request: Request, env: Env, ctx: any): Promise<Response> {\
  const authHeader = request.headers.get("Authorization");\
  if (authHeader !== `Bearer ${env.AXIM_SERVICE_KEY}`) {\
    return new Response("Unauthorized Vault Access", { status: 401, headers: getCorsHeaders(env, request) });\
  }\
\
  try { \
    const payload = await request.json() as any; \
    const { ticket_id, resolution_notes, patch_payload } = payload; \
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);\
\
    // Create pending HITL execution block\
    const { data: hitlLog, error: hitlError } = await supabase.from("hitl_audit_logs").insert({\
      status: "pending",\
      tool_type: "apply_git_patch",\
      payload: patch_payload,\
      support_ticket_id: ticket_id\
    }).select().single();\
\
    if (hitlError) throw hitlError;\
\
    // Inject proposed action into the message thread\
    await supabase.from("ticket_messages").insert({\
      ticket_id: ticket_id,\
      sender_id: "onyx_system",\
      message_body: resolution_notes || "Tier 3 Sandbox Agent has proposed a code resolution.",\
      metadata: { hitl_log_id: hitlLog.id }\
    });\
\
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) } });\
  } catch (err: any) { \
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: getCorsHeaders(env, request) }); \
  } \
}' onyx-edge-worker/src/index.ts
