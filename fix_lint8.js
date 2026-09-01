import fs from 'fs';

let code = fs.readFileSync('src/pages/TicketDetail.jsx', 'utf8');

// I inserted it into the right place, but let's just make sure llmDraftText is available in scope.
code = code.replace("const sampleDraft = llmDraftText || activeTicket.metadata?.auto_response_draft || null;",
                    "// Let React render conditionally if llmDraftText is defined below.\nconst sampleDraft = (typeof llmDraftText !== 'undefined' ? llmDraftText : '') || activeTicket.metadata?.auto_response_draft || null;");
fs.writeFileSync('src/pages/TicketDetail.jsx', code);
