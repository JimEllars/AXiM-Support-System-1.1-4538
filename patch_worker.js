<<<<<<< SEARCH
    // --- AI AUTO-DRAFT FEEDBACK TELEMETRY ENDPOINT ---
=======
    if (url.pathname === '/api/dlq' && request.method === 'POST') {
      try {
        const body = await request.json() as { action: string; payload: any; ticketId: string };

        if (body.action === 'retry') {
          // Re-validate payload and re-route through intake processing
          const reprocessed = await reprocessIntakePayload(body.payload, env);

          return new Response(JSON.stringify({
            success: true,
            status: 'reprocessed',
            ticketId: body.ticketId,
            details: reprocessed
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) }
          });
        }

        return new Response(JSON.stringify({ error: 'Unsupported DLQ action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env, request) }
        });
      }
    }

    // --- AI AUTO-DRAFT FEEDBACK TELEMETRY ENDPOINT ---
>>>>>>> REPLACE
