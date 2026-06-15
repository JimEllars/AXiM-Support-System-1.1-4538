sed -i.bak -e '/if (url.pathname === "\/api\/v1\/trigger-daily-digest") {/a\
\
    if (url.pathname === "/api/v1/trigger-sla-sweep") {\
        const authHeader = request.headers.get("Authorization");\
        if (authHeader !== `Bearer ${env.AXIM_ONYX_SECRET}`) return new Response("Unauthorized", { status: 401 });\
\
        ctx.waitUntil(handleSLASweep(env));\
        return new Response(JSON.stringify({ success: true, message: "SLA Sweep triggered manually." }), { status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) } });\
    }' onyx-edge-worker/src/index.ts
