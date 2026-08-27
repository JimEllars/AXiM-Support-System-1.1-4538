import fs from 'fs';

let code = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf8');

// Insert route for /api/v1/chat/convert
code = code.replace(
  'if (url.pathname === "/api/v1/chat/connect") {',
  `if (url.pathname === "/api/v1/chat/convert" && request.method === "POST") {
      return handleChatConvert(request, env);
    }

    if (url.pathname === "/api/v1/chat/connect") {`
);

// Update handleChatConnect
const oldChatConnect = `function handleChatConnect(request: Request, env: Env): Response {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  // @ts-ignore - Cloudflare Workers specific API
  const { 0: client, 1: server } = new WebSocketPair();

  server.accept();

  server.addEventListener("message", (event) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
      if (data && data.type === "ping") {
        server.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      } else if (data && data.type === "chat_message") {
         // Echo back for now or broadcast to other clients in a real implementation
         // server.send(JSON.stringify(data));
      }
    } catch (e) {
      console.error("WebSocket message parse error:", e);
    }
  });`;

const newChatConnect = `async function handleChatConvert(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(env, request) });

  const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: \`Bearer \${token}\` } }
  });

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 403, headers: getCorsHeaders(env, request) });

  try {
    const payload: any = await request.json();
    const { chat_messages, customer_email } = payload;

    if (!chat_messages || !Array.isArray(chat_messages)) {
      return new Response(JSON.stringify({ error: "Missing or invalid chat_messages array" }), { status: 400, headers: getCorsHeaders(env, request) });
    }

    const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Get customer ID logic. Defaulting to empty if not found, let's keep it simple.
    // Assuming for simplicity customer_id will just be a random user ID for now if customer_email doesn't map, or operator's ID.
    // Using user.id as fallback.
    let customerId = user.id;
    if (customer_email) {
      const { data: customer } = await supabaseAdmin
        .from('contacts_ax2024')
        .select('id')
        .eq('email', customer_email)
        .single();
      if (customer) {
        customerId = customer.id;
      }
    }

    const transcript = chat_messages.map((m: any) => \`[\${new Date(m.timestamp || Date.now()).toLocaleTimeString()}] \${m.sender}: \${m.text}\`).join('\\n');

    const { data: newTicket, error: insertError } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        subject: "Chat Conversion: Customer Inquiry",
        description: transcript,
        status: "open",
        priority: "medium",
        customer_id: customerId,
        assignee_id: user.id
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, ticket_id: newTicket.id }), {
      status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: getCorsHeaders(env, request) });
  }
}

function handleChatConnect(request: Request, env: Env): Response {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  // @ts-ignore - Cloudflare Workers specific API
  const { 0: client, 1: server } = new WebSocketPair();

  server.accept();
  let chatHistory: any[] = [];

  server.addEventListener("message", async (event) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
      if (data && data.type === "ping") {
        server.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      } else if (data && data.type === "chat_message") {
         chatHistory.push(data);
         if (chatHistory.length > 4) chatHistory.shift();

         // Echo back for now or broadcast to other clients in a real implementation
         // server.send(JSON.stringify(data));

         if (env.AI && data.sender !== 'Operator') {
           const messagesContext = chatHistory.map(msg => \`\${msg.sender}: \${msg.text}\`).join('\\n');
           const prompt = \`You are a helpful customer support agent. Provide a concise, professional reply suggestion to the customer's last message.\\n\\nChat history:\\n\${messagesContext}\\n\\nReply suggestion:\`;

           try {
             const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
               prompt
             });

             if (aiResponse && aiResponse.response) {
                server.send(JSON.stringify({ type: "ai_suggestion", text: aiResponse.response.trim() }));
             }
           } catch (aiErr) {
             console.error("AI text generation error:", aiErr);
           }
         }
      }
    } catch (e) {
      console.error("WebSocket message parse error:", e);
    }
  });`;

if (code.includes(oldChatConnect)) {
  code = code.replace(oldChatConnect, newChatConnect);
  fs.writeFileSync('onyx-edge-worker/src/index.ts', code);
  console.log('patched index.ts successfully');
} else {
  console.log('could not find oldChatConnect in index.ts to replace');
}
