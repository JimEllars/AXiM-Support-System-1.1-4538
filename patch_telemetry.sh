sed -i '3540i\
    // Inside handleTelemetryIngress after creating a new urgent ticket:\
    if (payload.severity === "critical" || newTicket.priority === "urgent") {\
      ctx.waitUntil(sendEmailItNotification(\
        "james.ellars@axim.us.com",\
        `🚨 [URGENT SLA ALERT] Support Ticket #${newTicket.id.slice(0, 8)} Spawned`,\
        `<div style="font-family: monospace; background: #09090b; color: #f4f4f5; padding: 20px; border-radius: 12px;">\
          <h2 style="color: #f43f5e; margin-top: 0;">CRITICAL SYSTEM ANOMALY DETECTED</h2>\
          <p><strong>App Target:</strong> ${targetApplicationCode}</p>\
          <p><strong>Error Code:</strong> ${incidentErrorCode}</p>\
          <p><strong>Details:</strong> ${incidentDescription}</p>\
          <p style="color: #a1a1aa; font-size: 11px;">Edge Node Location: ${logCtx.edge_colo}</p>\
        </div>`,\
        env\
      ));\
    }\
' onyx-edge-worker/src/index.ts
