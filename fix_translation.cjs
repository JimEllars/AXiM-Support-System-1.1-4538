const fs = require('fs');
let code = fs.readFileSync('src/components/tickets/MessageThread.jsx', 'utf8');

// Need to import FiGlobe or similar if we want a nice icon, wait, we have FiCode, FiExternalLink etc.
// I'll just use 🌐 emoji or import FiGlobe.
code = code.replace(
    "import { FiCode, FiExternalLink, FiChevronDown, FiChevronRight, FiGitCommit, FiUser, FiCpu, FiFileText, FiMail, FiCheck, FiEye, FiAlertCircle, FiDatabase } from 'react-icons/fi';",
    "import { FiCode, FiExternalLink, FiChevronDown, FiChevronRight, FiGitCommit, FiUser, FiCpu, FiFileText, FiMail, FiCheck, FiEye, FiAlertCircle, FiDatabase, FiGlobe } from 'react-icons/fi';"
);

// Add translation state and function inside MessageThread component
const stateAndFuncCode = `
  const [translatedMessages, setTranslatedMessages] = useState({});
  const [translatingId, setTranslatingId] = useState(null);

  const handleTranslate = async (msgId, text) => {
    // Toggle off if already translated
    if (translatedMessages[msgId]) {
      setTranslatedMessages(prev => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
      return;
    }

    setTranslatingId(msgId);
    try {
      // Use the Core's llm-proxy endpoint as requested
      const coreUrl = import.meta.env.VITE_CORE_API_URL || 'http://localhost:54321/functions/v1/axim-core';
      const token = (await useTicketStore.getState().supabase.auth.getSession()).data.session?.access_token;

      const res = await fetch(\`\${coreUrl}/api/v1/llm-proxy\`, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': \`Bearer \${token}\` } : {})
         },
         body: JSON.stringify({
            prompt: \`Translate this support message accurately to English/Spanish preserving technical terminology.\\n\\nMessage:\\n\${text}\`
         })
      });

      if (!res.ok) throw new Error('Translation failed');
      const data = await res.json();
      const translatedText = data.response || data.text || data.translation || "Translation unavailable";

      setTranslatedMessages(prev => ({
         ...prev,
         [msgId]: translatedText
      }));
    } catch (err) {
      console.error("Translation error:", err);
    } finally {
      setTranslatingId(null);
    }
  };
`;

code = code.replace(
    'const [expandedDiffs, setExpandedDiffs] = useState({});',
    'const [expandedDiffs, setExpandedDiffs] = useState({});\n' + stateAndFuncCode
);

// Add the translate button in the message header actions (where the checkmarks/adds to Onyx are)
const translateButton = `
                <button
                  onClick={() => handleTranslate(msg.id, msg.message_body)}
                  disabled={translatingId === msg.id}
                  className="flex items-center gap-1 text-[10px] bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700 transition-colors"
                  title="Translate Message"
                >
                  <FiGlobe /> {translatingId === msg.id ? 'Translating...' : (translatedMessages[msg.id] ? 'Original' : 'Translate')}
                </button>
`;

code = code.replace(
    '{(!isSystem && !isEmailInbound && (ticketStatus === "resolved" || activeTicket?.status === "resolved")) && (',
    translateButton + '\n                {(!isSystem && !isEmailInbound && (ticketStatus === "resolved" || activeTicket?.status === "resolved")) && ('
);


// And render the translated text below the original text
const translationRender = `
            {translatedMessages[msg.id] && (
              <div className="mt-2 p-2 rounded bg-zinc-800/40 border border-zinc-700/50">
                <div className="text-[10px] font-mono text-zinc-500 mb-1 flex items-center gap-1"><FiGlobe /> Translated:</div>
                <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">{translatedMessages[msg.id]}</p>
              </div>
            )}
`;

code = code.replace(
    '            <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">\n              {msg.message_body}\n            </p>',
    '            <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">\n              {msg.message_body}\n            </p>\n' + translationRender
);

fs.writeFileSync('src/components/tickets/MessageThread.jsx', code);
console.log('MessageThread translation toggle updated.');
