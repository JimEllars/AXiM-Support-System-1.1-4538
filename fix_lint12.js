import fs from 'fs';

let code = fs.readFileSync('src/pages/TicketDetail.jsx', 'utf8');
code = code.replace("let llmDraftText = '';\\n", "");
code = code.replace("const sampleDraft = llmDraftText || (activeTicket.metadata?.auto_response_draft || null);", "const sampleDraft = activeTicket.metadata?.auto_response_draft || null;");
fs.writeFileSync('src/pages/TicketDetail.jsx', code);
