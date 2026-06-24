import re

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    content = f.read()

pattern = r"""const \{ data: ticket, error: ticketError \} = await supabase
  \.from\("support_tickets"\)
  \.insert\(\{
    assigned_department: assignedDepartment,
    subject: normalizedData\.subject,
    description: normalizedData\.description,
    customer_id: customerId,
    organization_id: customerOrgId, // <-- CRITICAL: Bind tenant context here
    priority: "medium",
    status: "open",
    sla_breach_at: new Date\(Date\.now\(\) \+ 24 \* 60 \* 60 \* 1000\)\.toISOString\(\),
    metadata: \{
        source: normalizedData\.source,
        tags: normalizedData\.tags,
        workflow_category: normalizedData\.workflow_category,
    \},
  \}\)
  \.select\(\)
  \.single\(\);

    if \(ticketError\) throw ticketError;

    // 3\. Immediately Return 200 OK Response
    const response = new Response\(
      JSON\.stringify\(\{ success: true, ticket_id: ticket\.id \}\),
      \{
        headers: \{
          "Content-Type": "application/json",
          \.\.\.getCorsHeaders\(env, request\),
        \},
      \},
    \);"""

replacement = """const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        assigned_department: assignedDepartment,
        subject: normalizedData.subject,
        description: normalizedData.description,
        customer_id: customerId,
        organization_id: customerOrgId,
        priority: "medium",
        status: "open",
        sla_breach_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
            source: normalizedData.source,
            tags: normalizedData.tags,
            workflow_category: normalizedData.workflow_category,
        },
      })
      .select()
      .single();

    if (ticketError) throw ticketError;

    // --- CRITICAL THREAD SYNC: Inject initial customer request into the message timeline ---
    const { error: initialMsgError } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: ticket.id,
        sender_id: "customer", // Explicitly flag as external customer origin
        message_body: normalizedData.description || "No detailed description provided.",
        is_internal_note: false,
      });

    if (initialMsgError) {
       console.error("Failed to sync initial description to message thread:", initialMsgError);
    }
    // --------------------------------------------------------------------------------------

    // 3. Immediately Return 200 OK Response
    const response = new Response(
      JSON.stringify({ success: true, ticket_id: ticket.id }),
      { headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) } }
    );"""

new_content = re.sub(pattern, replacement, content)

if new_content != content:
    with open('onyx-edge-worker/src/index.ts', 'w') as f:
        f.write(new_content)
    print("Replaced successfully")
else:
    print("Pattern not found")
