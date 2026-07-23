sed -i '3349i\
    // Inside handleExecuteAction when an HITL proposal requires manual approval:\
    ctx.waitUntil(sendEmailItNotification(\
      "james.ellars@axim.us.com",\
      `⚡ [HITL APPROVAL REQUIRED] Action Proposal for Ticket #${hitlLog.support_ticket_id?.slice(0, 8) || '\''N/A'\''}`,\
      `<div style="font-family: monospace; background: #09090b; color: #f4f4f5; padding: 20px; border-radius: 12px;">\
        <h2 style="color: #6366f1; margin-top: 0;">HUMAN-IN-THE-LOOP APPROVAL REQUESTED</h2>\
        <p><strong>Tool Type:</strong> ${hitlLog.tool_type}</p>\
        <p><strong>Ticket ID:</strong> ${hitlLog.support_ticket_id || '\''N/A'\''}</p>\
        <p><strong>Status:</strong> Pending Approval</p>\
        <p><a href="https://support.axim.us.com" style="color: #10b981; font-weight: bold;">Enter Support Cockpit HUD to Approve</a></p>\
      </div>`,\
      env\
    ));\
' onyx-edge-worker/src/index.ts
