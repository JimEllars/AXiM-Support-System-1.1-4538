import re

with open('./src/pages/TicketDetail.jsx', 'r') as f:
    content = f.read()

# Replace <OnyxInvestigationPanel ticketId={id} isInvestigating={isInvestigating} />
# with {isInvestigating && <OnyxInvestigationPanel ticketId={id} />}
content = content.replace(
    '<OnyxInvestigationPanel ticketId={id} isInvestigating={isInvestigating} />',
    '{isInvestigating && <OnyxInvestigationPanel ticketId={id} />}'
)

# Fix telemetry.auto_response_draft.substring to use optional chaining
content = content.replace(
    'telemetry.auto_response_draft.substring(0, 150)',
    'telemetry?.auto_response_draft?.substring(0, 150)'
)

# Fix telemetry.confidence_score to use optional chaining
content = content.replace(
    '{telemetry.confidence_score}% Confidence',
    '{telemetry?.confidence_score}% Confidence'
)

content = content.replace(
    '{telemetry.primary_intent}',
    '{telemetry?.primary_intent}'
)

with open('./src/pages/TicketDetail.jsx', 'w') as f:
    f.write(content)
