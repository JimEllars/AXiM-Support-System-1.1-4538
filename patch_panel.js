import fs from 'fs';

let code = fs.readFileSync('src/components/chat/LiveChatPanel.jsx', 'utf8');

// 1. imports
if (!code.includes("import { useState, useEffect, useRef } from 'react';")) {
    code = code.replace("import React from 'react';", "import React, { useState, useEffect, useRef } from 'react';");
}

if (!code.includes("import { FiExternalLink }")) {
  code = code.replace("import { FiMessageCircle, FiMinimize2, FiSend } from 'react-icons/fi';", "import { FiMessageCircle, FiMinimize2, FiSend, FiExternalLink } from 'react-icons/fi';");
}


// 2. state for AI suggestions
if (!code.includes("const [aiSuggestion, setAiSuggestion]")) {
  code = code.replace(
    "const [isConnected, setIsConnected] = useState(false);",
    `const [isConnected, setIsConnected] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);`
  );
}

// 3. convert to ticket handler
const handleConvertCode = `
  const handleConvertToTicket = async () => {
    if (messages.length === 0) {
      toast.error("No messages to convert.");
      return;
    }

    try {
      const edgeUrl = getEdgeWorkerUrl();
      const res = await fetch(\`\${edgeUrl}/api/v1/chat/convert\`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": \`Bearer \${useAuthStore.getState().session?.access_token || ''}\`
        },
        body: JSON.stringify({
          chat_messages: messages.filter(m => !m.isSystem),
          customer_email: user?.email || ""
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to convert");

      toast.success(\`Converted to Ticket #\${data.ticket_id.substring(0,8)}\`);

      disconnectWebSocket();
      setMessages([]);
      setIsExpanded(false);
      setAiSuggestion(null);
    } catch (err) {
      console.error("[LiveChat] Conversion error:", err);
      toast.error(err.message || "Conversion failed.");
    }
  };
`;

if (!code.includes("const handleConvertToTicket")) {
  code = code.replace(
    "const disconnectWebSocket = () => {",
    handleConvertCode + "\n\n  const disconnectWebSocket = () => {"
  );
}

// 4. WebSocket 'ai_suggestion' handler
const oldWsOnMessage = `} else if (data.type === 'pong') {`;
const newWsOnMessage = `} else if (data.type === 'ai_suggestion') {
             setAiSuggestion(data.text);
             toast('AI Suggestion Available', { icon: '🤖', style: { background: '#09090b', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' } });
          } else if (data.type === 'pong') {`;

if (code.includes(oldWsOnMessage)) {
  code = code.replace(oldWsOnMessage, newWsOnMessage);
}

// 5. Header 'Convert to Ticket' button
const oldHeader = `<div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <FiMinimize2 size={14} />
          </button>
        </div>`;
const newHeader = `<div className="flex items-center gap-2">
          <button
            onClick={handleConvertToTicket}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded bg-zinc-800 text-zinc-300 hover:bg-indigo-600 hover:text-white transition-colors"
            title="Convert to Ticket"
          >
            <FiExternalLink size={10} />
            <span>CONVERT</span>
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <FiMinimize2 size={14} />
          </button>
        </div>`;

if (code.includes(oldHeader)) {
  code = code.replace(oldHeader, newHeader);
}

// 6. AI Suggestion Bubble
const oldInputArea = `{/* Input Area */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800">`;
const newInputArea = `{/* AI Suggestion Area */}
      {aiSuggestion && (
        <div className="px-3 py-2 bg-zinc-900 border-t border-zinc-800 animate-in fade-in slide-in-from-bottom-2">
           <div className="text-[10px] font-mono text-indigo-400 mb-1 flex items-center gap-1">
             <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
             Onyx Auto-Suggest
           </div>
           <div className="flex gap-2 items-start">
             <div className="flex-1 text-xs text-zinc-300 italic bg-zinc-950 p-2 rounded-lg border border-zinc-800">
               {aiSuggestion}
             </div>
             <button
               onClick={() => {
                 setInputValue(aiSuggestion);
                 setAiSuggestion(null);
               }}
               className="text-[10px] font-mono bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white px-2 py-1 rounded transition-colors"
             >
               USE
             </button>
           </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800">`;

if (code.includes(oldInputArea)) {
  code = code.replace(oldInputArea, newInputArea);
}


fs.writeFileSync('src/components/chat/LiveChatPanel.jsx', code);
console.log('patched LiveChatPanel.jsx successfully');
