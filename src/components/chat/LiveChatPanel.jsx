import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiSend, FiMinimize2, FiMaximize2, FiMessageCircle, FiPaperclip } from 'react-icons/fi';
import { useAuthStore } from '../../store/useAuthStore';
import { getEdgeWorkerUrl } from '../../lib/edgeWorkerUrl';
import toast from 'react-hot-toast';

export default function LiveChatPanel() {
  const { isChatOnline, user } = useAuthStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [sentimentAlert, setSentimentAlert] = useState(null);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(0);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [readReceipts, setReadReceipts] = useState({});
  const [showOriginal, setShowOriginal] = useState({});
  const [kbSuggestion, setKbSuggestion] = useState(null);
  const fileInputRef = useRef(null);

  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

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
          } else if (data.type === 'chat_message' || data.type === 'internal_whisper') {
             setTimeoutWarning(false);
             setMessages(prev => [...prev, {
                id: data.id || 'msg-' + Date.now(),
                type: data.type,
                sender: data.sender || 'Customer',
                text: data.text,
                timestamp: data.timestamp || new Date().toISOString(),
                isSystem: false,
                isIncoming: true
             }]);
             if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
               wsRef.current.send(JSON.stringify({
                 type: "read_receipt",
                 sender: useAuthStore.getState().user?.email || 'Operator',
                 messageId: data.id || 'msg-' + Date.now(),
                 timestamp: Date.now()
               }));
             }
             if (!isExpanded) {
               setIsExpanded(true);
               toast('New live chat message received!', {
                 icon: '💬',
                 style: { background: '#09090b', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }
               });
             }
          } else if (data.type === 'kb_suggestion') {
             setKbSuggestion({ title: data.title, memory_id: data.memory_id });
             toast('KB Suggestion Available', { icon: '💡', style: { background: '#09090b', color: '#fcd34d', border: '1px solid rgba(252,211,77,0.3)' } });
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
          } else if (data.type === 'typing_start') {
             if (data.sender !== (useAuthStore.getState().user?.email || 'Operator')) {
               setIsPeerTyping(true);
             }
          } else if (data.type === 'typing_stop') {
             if (data.sender !== (useAuthStore.getState().user?.email || 'Operator')) {
               setIsPeerTyping(false);
             }
          } else if (data.type === 'read_receipt') {
             if (data.sender !== (useAuthStore.getState().user?.email || 'Operator') && data.messageId) {
               setReadReceipts(prev => ({ ...prev, [data.messageId]: data.timestamp }));
             }
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


  const handleFileAttachment = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5MB limit');
      e.target.value = '';
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Unsupported file type. Please upload PNG, JPEG, or PDF.');
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      // 1. Get presigned URL
      const authHeader = useAuthStore.getState().session?.access_token || '';
      const response = await fetch(`${getEdgeWorkerUrl()}/api/v1/chat/upload-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authHeader}`
        },
        body: JSON.stringify({
          filename: file.name,
          file_size: file.size,
          mime_type: file.type
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to authorize upload');

      // 2. PUT file directly to Supabase storage
      const uploadRes = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file
      });

      if (!uploadRes.ok) throw new Error('Failed to upload file');

      // 3. Send message with attachment
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const newMessage = {
          type: 'chat_message',
          text: 'Attachment sent',
          sender: user?.email || 'Operator',
          timestamp: new Date().toISOString(),
          attachment_url: data.publicUrl
        };

        wsRef.current.send(JSON.stringify(newMessage));

        setMessages(prev => [...prev, {
          id: 'local-' + Date.now(),
          sender: newMessage.sender,
          text: newMessage.text,
          timestamp: newMessage.timestamp,
          isSystem: false,
          isIncoming: false,
          attachment_url: data.publicUrl
        }]);
      } else {
        toast.error("Not connected to chat server.");
      }
    } catch (err) {
      console.error('[LiveChat] Attachment error:', err);
      toast.error(err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !isConnected || isReadOnly) return;
    setTimeoutWarning(false);

    const newMessage = {
      type: isInternalNote ? 'internal_whisper' : 'chat_message',
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
                  msg.type === 'internal_whisper'
                    ? 'bg-yellow-600/20 text-yellow-100 border border-yellow-500/30 ' + (msg.isIncoming ? 'rounded-tl-sm' : 'rounded-tr-sm')
                    : msg.isIncoming
                      ? (msg.isEscalated ? 'bg-rose-950/80 text-rose-200 rounded-tl-sm border border-rose-500/50 shadow-[0_0_15px_rgba(225,29,72,0.2)]' : 'bg-zinc-800 text-zinc-200 rounded-tl-sm')
                      : 'bg-indigo-600 text-white rounded-tr-sm'
                }`}>
                  <div className="text-[10px] font-mono opacity-60 mb-1 flex justify-between">
                    <span>{msg.isIncoming ? (msg.type === 'internal_whisper' ? 'Operator (Internal)' : 'Customer') : (msg.type === 'internal_whisper' ? 'You (Internal)' : 'You')}</span>
                    {msg.type === 'internal_whisper' && <span className="ml-2 px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 text-[8px] uppercase tracking-wider">Internal Only</span>}
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} {readReceipts[msg.id] && !msg.isIncoming && <span className="ml-1 text-emerald-400 font-bold" title="Seen">✓</span>}</span>
                  </div>
                                    <div className="text-sm font-sans whitespace-pre-wrap break-words leading-snug">
                    {msg.translated_text && !showOriginal[msg.id || i] ? msg.translated_text : msg.text}
                    {msg.translated_text && (
                      <div className="mt-1">
                        <button
                          onClick={() => setShowOriginal(prev => ({...prev, [msg.id || i]: !prev[msg.id || i]}))}
                          className="inline-flex items-center gap-1 text-[9px] font-bold font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 transition-colors shadow-sm"
                        >
                          {showOriginal[msg.id || i] ? "Show Translation" : "Show Original"}
                        </button>
                      </div>
                    )}
                    {msg.attachment_url && (
                      <div className="mt-2">
                        {msg.attachment_url.toLowerCase().endsWith('.pdf') ? (
                          <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                            <FiPaperclip size={12} /> View PDF Attachment
                          </a>
                        ) : (
                          <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                            <img src={msg.attachment_url} alt="Attachment" className="max-w-full h-auto rounded-lg mt-1 border border-zinc-700 max-h-48 object-contain" />
                          </a>
                        )}
                      </div>
                    )}
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


      {/* Typing Indicator */}
      {isPeerTyping && (
        <div className="px-3 py-1 bg-zinc-950 text-[10px] font-mono text-zinc-400 italic flex items-center gap-1 animate-in fade-in slide-in-from-bottom-1">
          <div className="flex space-x-1">
            <div className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <span>Customer is typing...</span>
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
      <div className="p-3 bg-zinc-900 border-t border-zinc-800 relative">
        <div className="flex gap-2 mb-2 px-1">
          <button
            type="button"
            onClick={() => setIsInternalNote(false)}
            className={`text-[10px] px-3 py-1 rounded-full font-mono transition-colors ${!isInternalNote ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
          >
            Public Reply
          </button>
          <button
            type="button"
            onClick={() => setIsInternalNote(true)}
            className={`text-[10px] px-3 py-1 rounded-full font-mono transition-colors flex items-center gap-1 ${isInternalNote ? 'bg-yellow-600/20 text-yellow-500 border border-yellow-600/50' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
          >
            <span className="w-2 h-2 rounded-full bg-current"></span> Internal Note
          </button>
        </div>
        {kbSuggestion && (
          <div className="absolute -top-10 left-3 right-3 flex items-center justify-between px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-[10px] font-mono shadow-lg backdrop-blur-sm z-10 animate-in fade-in slide-in-from-bottom-2">
            <button
              type="button"
              className="flex-1 text-left truncate hover:text-amber-200 transition-colors flex items-center gap-2"
              onClick={() => {
                setInputValue(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + `[KB: ${kbSuggestion.title}](/kb/${kbSuggestion.memory_id})`);
                setKbSuggestion(null);
              }}
            >
              <span>💡 Suggested: {kbSuggestion.title}</span>
              <span className="opacity-50 text-[9px]">Click to insert link</span>
            </button>
            <button
              type="button"
              className="ml-2 p-1 hover:bg-amber-500/20 rounded-full transition-colors flex-shrink-0"
              onClick={() => setKbSuggestion(null)}
              title="Dismiss"
            >
              <FiX size={12} />
            </button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileAttachment}
            className="hidden"
            accept="image/png,image/jpeg,application/pdf"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected || isReadOnly || isUploading}
            className="p-2.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-50 disabled:hover:bg-zinc-800 transition-colors flex-shrink-0 flex items-center justify-center"
            title="Attach File"
          >
            <FiPaperclip size={16} />
          </button>
          <textarea

            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'typing_start', sender: user?.email || 'Operator' }));
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => {
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'typing_stop', sender: user?.email || 'Operator' }));
                  }
                }, 2000);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            placeholder={isReadOnly ? "Session Closed due to Inactivity" : isConnected ? "Type a message..." : "Reconnecting..."}
            disabled={!isConnected || isReadOnly}
            className={`flex-1 max-h-32 min-h-[40px] ${isInternalNote ? 'bg-yellow-950/20 border-yellow-600/30 text-yellow-100 placeholder-yellow-700/50 focus:border-yellow-500' : 'bg-zinc-950 border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:border-indigo-500'} border rounded-xl px-3 py-2 text-sm transition-colors resize-none font-sans disabled:opacity-50`}
            rows={1}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || !isConnected || isUploading}
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
