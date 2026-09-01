import fs from 'fs';

let code = fs.readFileSync('src/pages/TicketDetail.jsx', 'utf8');
code = code.replace("const sampleDraft = typeof llmDraftText !== 'undefined' ? llmDraftText : (activeTicket.metadata?.auto_response_draft || null);",
                    "let llmDraftText = '';\nconst sampleDraft = llmDraftText || (activeTicket.metadata?.auto_response_draft || null);");
fs.writeFileSync('src/pages/TicketDetail.jsx', code);
