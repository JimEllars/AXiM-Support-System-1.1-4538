sed -i '513i\
\
    // --- SECURE EMAIL DISPATCH ROUTE ---\
    if (url.pathname === "/api/v1/email/send" && request.method === "POST") {\
      const authHeader = request.headers.get("Authorization") || "";\
      const token = authHeader.replace("Bearer ", "").trim();\
      if (!token) {\
        return new Response(JSON.stringify({ error: "UNAUTHORIZED_EMAIL_DISPATCH" }), {\
          status: 401, headers: getCorsHeaders(env, request)\
        });\
      }\
\
      const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {\
        global: { headers: { Authorization: `Bearer ${token}` } }\
      });\
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();\
      if (authError || !user) {\
        return new Response(JSON.stringify({ error: "INVALID_OPERATOR_SESSION" }), {\
          status: 403, headers: getCorsHeaders(env, request)\
        });\
      }\
\
      try {\
        const payload: any = await request.json();\
        const { to, subject, html } = payload;\
\
        if (!to || !subject || !html) {\
          return new Response(JSON.stringify({ error: "MISSING_EMAIL_PARAMETERS" }), {\
            status: 400, headers: getCorsHeaders(env, request)\
          });\
        }\
\
        const sent = await sendEmailItNotification(to, subject, html, env);\
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);\
\
        await supabase.from("events_ax2024").insert({\
          type: "email_dispatched",\
          payload: {\
            recipient: to,\
            subject,\
            operator_id: user.id,\
            success: sent,\
            timestamp: new Date().toISOString()\
          }\
        });\
\
        return new Response(JSON.stringify({ success: sent, recipient: to }), {\
          status: sent ? 200 : 502,\
          headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }\
        });\
      } catch (err: any) {\
        return new Response(JSON.stringify({ error: err.message }), {\
          status: 500, headers: getCorsHeaders(env, request)\
        });\
      }\
    }\
' onyx-edge-worker/src/index.ts
