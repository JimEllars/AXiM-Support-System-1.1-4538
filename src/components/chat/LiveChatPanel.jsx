import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiSend, FiMinimize2, FiMaximize2, FiMessageCircle } from 'react-icons/fi';
import { useAuthStore } from '../../store/useAuthStore';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';
import toast from 'react-hot-toast';

export default function LiveChatPanel() {
  const { isChatOnline, user } = useAuthStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [sentimentAlert, setSentimentAlert] = useState(null);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(0);
  const [isReadOnly, setIsReadOnly] = useState(false);

  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    let timer = null;
    if (timeoutWarning && timeoutSeconds > 0) {
      timer = setInterval(() => {
        setTimeoutSeconds(prev => prev - 1);
      }, 1000);
    } else if (timeoutSeconds === 0 && timeoutWarning) {
      setTimeoutWarning(false);
    }
    return () => clearInterval(timer);
  }, [timeoutWarning, timeoutSeconds]);

  useEffect(() => {
    if (isChatOnline) {
       connectWebSocket();
    } else {
       disconnectWebSocket();
       setMessages([]);
       setIsExpanded(false);
    }

    return () => {
      disconnectWebSocket();
    };
  }, [isChatOnline]);

  useEffect(() => {
    if (isExpanded) {
       scrollToBottom();
    }
  }, [messages, isExpanded]);

  const connectWebSocket = () => {
    if (wsRef.current) return;

    // Connect to edge worker
    const wsUrl = getEdgeWorkerUrl().replace('http', 'ws') + '/api/v1/chat/connect';

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[LiveChat] Connected to WebSocket');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'connection_established') {
             toast.success('Live Chat connection established.', {
                style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
             });
             setMessages(prev => [...prev, {
                id: 'system-' + Date.now(),
                sender: 'System',
                text: 'Connection established. Waiting for incoming customer queries...',
                timestamp: new Date().toISOString(),
                isSystem: true
             }]);
          } else if (data.type === 'timeout_warning') {
             setTimeoutWarning(true);
             setTimeoutSeconds(data.expiresIn || 60);
          } else if (data.type === 'chat_message') {
             setTimeoutWarning(false);
             setMessages(prev => [...prev, {
                id: data.id || 'msg-' + Date.now(),
                sender: data.sender || 'Customer',
                text: data.text,
                timestamp: data.timestamp || new Date().toISOString(),
                isSystem: false,
                isIncoming: true
             }]);
             if (!isExpanded) {
               setIsExpanded(true);
               toast('New live chat message received!', {
                 icon: '💬',
                 style: { background: '#09090b', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }
               });
             }
          } else if (data.type === 'ai_suggestion') {
             setAiSuggestion(data.text);
             toast('AI Suggestion Available', { icon: '🤖', style: { background: '#09090b', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' } });
          } else if (data.type === 'sentiment_alert') {
             setSentimentAlert(data);
             if (data.messageId) {
               setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, isEscalated: true } : m));
             } else {
               setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, isEscalated: true } : m));
             }
             if (!isExpanded) {
               setIsExpanded(true);
             }
             toast.error('High Frustration Detected!', {
               icon: '⚠️',
               style: { background: '#09090b', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }
             });
          } else if (data.type === 'pong') {
             // Keep-alive heartbeat received
          }
        } catch (e) {
          console.error('[LiveChat] Error parsing message:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsReadOnly(true);
        setTimeoutWarning(false);
        setMessages(prev => [...prev, {
          id: 'system-' + Date.now(),
          sender: 'System',
          text: 'Session Closed due to Inactivity',
          timestamp: new Date().toISOString(),
          isSystem: true
        }]);
        wsRef.current = null;
        console.log('[LiveChat] WebSocket disconnected');

        // Auto-reconnect if we should be online
        if (useAuthStore.getState().isChatOnline) {
          setTimeout(() => {
            console.log('[LiveChat] Attempting to reconnect...');
            connectWebSocket();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('[LiveChat] WebSocket error:', error);
      };

      wsRef.current = ws;

      // Keep-alive interval
      const pingInterval = setInterval(() => {
         if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
         } else {
            clearInterval(pingInterval);
         }
      }, 25000);

    } catch (err) {
      console.error('[LiveChat] Failed to create WebSocket connection:', err);
    }
  };


  const handleConvertToTicket = async () => {
    if (messages.length === 0) {
      toast.error("No messages to convert.");
      return;
    }

    try {
      const edgeUrl = getEdgeWorkerUrl();
      const res = await fetch(`${edgeUrl}/api/v1/chat/convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${useAuthStore.getState().session?.access_token || ''}`
        },
        body: JSON.stringify({
          chat_messages: messages.filter(m => !m.isSystem),
          customer_email: user?.email || ""
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to convert");

      toast.success(`Converted to Ticket #${data.ticket_id.substring(0,8)}`);

      disconnectWebSocket();
      setMessages([]);
      setIsExpanded(false);
      setAiSuggestion(null);
      setSentimentAlert(null);
    } catch (err) {
      console.error("[LiveChat] Conversion error:", err);
      toast.error(err.message || "Conversion failed.");
    }
  };


  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !isConnected || isReadOnly) return;
    setTimeoutWarning(false);

    const newMessage = {
      type: 'chat_message',
      text: inputValue.trim(),
      sender: user?.email || 'Operator',
      timestamp: new Date().toISOString()
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
       wsRef.current.send(JSON.stringify(newMessage));

       setMessages(prev => [...prev, {
          id: 'local-' + Date.now(),
          sender: newMessage.sender,
          text: newMessage.text,
          timestamp: newMessage.timestamp,
          isSystem: false,
          isIncoming: false
       }]);

       setInputValue('');
    } else {
       toast.error("Not connected to chat server.");
    }
  };

  if (!isChatOnline) return null;

  if (!isExpanded) {
    return (
      <div
        className="fixed bottom-6 right-6 z-50 animate-bounce"
        style={{ animationDuration: '3s' }}
      >
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-3 px-5 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg border border-indigo-400/30 transition-all group"
        >
          <div className="relative">
             <FiMessageCircle className="text-xl" />
             <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-indigo-600 animate-ping"></div>
             <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-indigo-600"></div>
          </div>
          <span className="font-mono font-bold text-sm tracking-wide">Live Chat {messages.length > 0 ? `(${messages.length})` : 'Active'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-6 z-50 w-96 flex flex-col shadow-2xl rounded-t-2xl bg-zinc-950 border border-zinc-800 transition-all duration-300 transform origin-bottom" style={{ height: '500px' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-rose-500'}`}></div>
          <span className="font-mono font-bold text-xs uppercase text-zinc-200 tracking-wider">
            Live Comms {isConnected ? '' : '(Reconnecting)'}
          </span>
          {sentimentAlert && (
             <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-500 border border-rose-500/30 animate-pulse">
               At-Risk Customer
             </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 font-mono text-xs text-center space-y-2">
             <FiMessageCircle size={24} className="text-zinc-700" />
             <p>Connection active.<br/>Waiting for incoming sessions...</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={msg.id || i}
              className={`flex flex-col ${msg.isSystem ? 'items-center' : msg.isIncoming ? 'items-start' : 'items-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              {msg.isSystem ? (
                 <div className="px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 font-mono text-center my-2">
                   {msg.text}
                 </div>
              ) : (
                <div className={`max-w-[85%] rounded-2xl p-3 ${
                  msg.isIncoming
                    ? (msg.isEscalated ? 'bg-rose-950/80 text-rose-200 rounded-tl-sm border border-rose-500/50 shadow-[0_0_15px_rgba(225,29,72,0.2)]' : 'bg-zinc-800 text-zinc-200 rounded-tl-sm')
                    : 'bg-indigo-600 text-white rounded-tr-sm'
                }`}>
                  <div className="text-[10px] font-mono opacity-60 mb-1 flex justify-between">
                    <span>{msg.isIncoming ? 'Customer' : 'You'}</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <div className="text-sm font-sans whitespace-pre-wrap break-words leading-snug">
                    {msg.text}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* AI Suggestion Area */}
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


      {/* Timeout Warning Area */}
      {timeoutWarning && (
        <div className="px-3 py-2 bg-rose-950 border-t border-rose-800 animate-in fade-in slide-in-from-bottom-2 flex items-center justify-between">
           <div className="text-[10px] font-mono text-rose-400 flex items-center gap-1">
             <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
             Session idle. Closing in {timeoutSeconds}s
           </div>
           <button
             onClick={() => {
               if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                 wsRef.current.send(JSON.stringify({ type: 'keep_alive' }));
                 setTimeoutWarning(false);
               }
             }}
             className="text-[10px] font-mono bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white px-2 py-1 rounded transition-colors"
           >
             KEEP ALIVE
           </button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800">
        <form onSubmit={handleSendMessage} className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            placeholder={isReadOnly ? "Session Closed due to Inactivity" : isConnected ? "Type a message..." : "Reconnecting..."}
            disabled={!isConnected || isReadOnly}
            className="flex-1 max-h-32 min-h-[40px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none font-sans disabled:opacity-50"
            rows={1}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || !isConnected}
            className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors flex-shrink-0 flex items-center justify-center"
          >
            <FiSend size={16} />
          </button>
        </form>
        <div className="mt-1 text-[9px] text-zinc-500 text-center font-mono">
           Powered by AXiM Edge Realtime
        </div>
      </div>

    </div>
  );
}
