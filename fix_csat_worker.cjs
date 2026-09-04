const fs = require('fs');

let workerCode = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf8');

// 1. Add CSAT endpoint handling
const csatRouteHandlerCode = `
    if (url.pathname.match(/^\\/api\\/v1\\/tickets\\/([^\\/]+)\\/csat$/) && request.method === "POST") {
      return handleCSATFeedback(request, env, ctx);
    }
`;

workerCode = workerCode.replace(
    'if (url.pathname === "/api/v1/email/digest" && request.method === "POST") {',
    csatRouteHandlerCode + '\n    if (url.pathname === "/api/v1/email/digest" && request.method === "POST") {'
);

// 2. Add handleCSATFeedback function
const handleCSATFeedbackFunc = `
async function handleCSATFeedback(request: Request, env: Env, ctx: any): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\\/api\\/v1\\/tickets\\/([^\\/]+)\\/csat$/);
  const ticketId = match ? match[1] : null;

  if (!ticketId) {
    return new Response(JSON.stringify({ error: "MISSING_TICKET_ID" }), { status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) } });
  }

  try {
    const payload: any = await request.json();
    const rating = payload.rating;
    const feedback_text = payload.feedback_text || "";

    if (!rating || rating < 1 || rating > 5) {
      return new Response(JSON.stringify({ error: "INVALID_RATING" }), { status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) } });
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Check if ticket exists
    const { data: ticket, error: ticketError } = await supabase.from('support_tickets').select('id, assigned_to').eq('id', ticketId).single();
    if (ticketError || !ticket) {
        return new Response(JSON.stringify({ error: "TICKET_NOT_FOUND" }), { status: 404, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) } });
    }

    const { error } = await supabase.from('ticket_feedback').insert({
      ticket_id: ticketId,
      rating: rating,
      feedback_text: feedback_text,
      operator_id: ticket.assigned_to
    });

    if (error) {
      console.error("Error inserting CSAT feedback", error);
      return new Response(JSON.stringify({ error: "DATABASE_ERROR" }), { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) } });
  } catch (error: any) {
    console.error("CSAT Handler Error", error);
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) } });
  }
}
`;

workerCode += '\n' + handleCSATFeedbackFunc;


// 3. Dispatch CSAT email in handleTicketResolved
const dispatchCsatEmailCode = `
    const dispatchCsatEmail = async () => {
      try {
        if (!record.customer_email && !record.customer_id) return;

        let customerEmail = record.customer_email;
        if (!customerEmail && record.customer_id) {
           const { data: contact } = await supabase.from('contacts_ax2024').select('email').eq('id', record.customer_id).single();
           if (contact) customerEmail = contact.email;
        }

        if (!customerEmail) return;

        const emailPayload = {
          from: "AXiM Support <support@axim.us.com>",
          to: customerEmail,
          subject: \`How did we do? Rate your support experience (Ticket #\${record.id.slice(0, 8)})\`,
          html: \`
            <h2>Ticket Resolved</h2>
            <p>Your support ticket (\${record.subject}) has been resolved.</p>
            <p>Please take a moment to rate your experience:</p>
            <div>
              <a href="https://axim.us.com/support/csat/\${record.id}?rating=1" style="padding: 10px; background: #eee; text-decoration: none; margin: 2px;">⭐ 1</a>
              <a href="https://axim.us.com/support/csat/\${record.id}?rating=2" style="padding: 10px; background: #eee; text-decoration: none; margin: 2px;">⭐ 2</a>
              <a href="https://axim.us.com/support/csat/\${record.id}?rating=3" style="padding: 10px; background: #eee; text-decoration: none; margin: 2px;">⭐ 3</a>
              <a href="https://axim.us.com/support/csat/\${record.id}?rating=4" style="padding: 10px; background: #eee; text-decoration: none; margin: 2px;">⭐ 4</a>
              <a href="https://axim.us.com/support/csat/\${record.id}?rating=5" style="padding: 10px; background: #eee; text-decoration: none; margin: 2px;">⭐ 5</a>
            </div>
          \`,
          text: \`Your ticket \${record.subject} has been resolved. Please rate us 1-5.\`
        };

        const emailitRes = await fetch("https://api.emailit.com/v2/emails", {
          method: "POST",
          headers: {
             "Authorization": \`Bearer \${env.EMAILIT_API_KEY}\`,
             "Content-Type": "application/json"
          },
          body: JSON.stringify(emailPayload)
        });

        if (!emailitRes.ok) {
           const fallbackRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                 "Authorization": \`Bearer \${env.RESEND_API_KEY}\`,
                 "Content-Type": "application/json"
              },
              body: JSON.stringify({
                  from: emailPayload.from,
                  to: [emailPayload.to],
                  subject: emailPayload.subject,
                  html: emailPayload.html,
                  text: emailPayload.text
              })
           });
           if (!fallbackRes.ok) {
               console.error("Both EmailIt and Resend failed to send CSAT email");
           }
        }
      } catch (e) {
         console.error("CSAT dispatch error:", e);
      }
    };
    ctx.waitUntil(dispatchCsatEmail());
`;

workerCode = workerCode.replace(
    'ctx.waitUntil(dispatchWebhook());',
    'ctx.waitUntil(dispatchWebhook());\n' + dispatchCsatEmailCode
);


fs.writeFileSync('onyx-edge-worker/src/index.ts', workerCode);
console.log('CSAT worker changes applied.');
