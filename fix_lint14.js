import fs from 'fs';

let code = fs.readFileSync('src/pages/TicketDetail.jsx', 'utf8');

// The replacement was done multiple times. Let's just fix it manually.
code = code.replace(/const \[llmDraftText, setLlmDraftText\] = useState\(''\);\s*useEffect\(\(\) => {[\s\S]*?}, \[activeTicket\?\.id\]\);/g, "");

const hookImplementation = `
  const [llmDraftText, setLlmDraftText] = useState('');
  useEffect(() => {
    if (activeTicket) {
      const fetchDraft = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;
          const res = await fetch(\`\${getEdgeWorkerUrl()}/api/v1/onyx/generate-suggestion\`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': \`Bearer \${session.access_token}\`
            },
            body: JSON.stringify({
              ticketId: activeTicket.id,
              subject: activeTicket.subject,
              description: activeTicket.description || '',
              history: []
            })
          });
          const data = await res.json();
          if (data.draft) {
            setLlmDraftText(data.draft);
          }
        } catch (e) {
          console.error("Draft generation failed", e);
        }
      };
      fetchDraft();
    }
  }, [activeTicket?.id]);
`;

code = code.replace("const [newMessage, setNewMessage] = useState('');", "const [newMessage, setNewMessage] = useState('');\n" + hookImplementation);

fs.writeFileSync('src/pages/TicketDetail.jsx', code);
