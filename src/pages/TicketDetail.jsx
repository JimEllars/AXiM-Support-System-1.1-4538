import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTicketStore } from '../store/useTicketStore';
import { useAuthStore } from '../store/useAuthStore';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import Customer360 from '../components/tickets/Customer360';
import KBSidebar from '../components/tickets/KBSidebar';
import AutoDraftWhisper from '../components/tickets/AutoDraftWhisper';
import ActionProposalBlock from '../components/tickets/ActionProposalBlock';
import OnyxInvestigationPanel from '../components/tickets/OnyxInvestigationPanel';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';

const { FiArrowLeft, FiClock, FiCheckCircle, FiCpu, FiMessageSquare, FiSend, FiLayout, FiActivity, FiGlobe, FiMail, FiZap, FiLock } = FiIcons;

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tickets, updateTicketStatus, teamMembers, subscribeToTickets } = useTicketStore();
  const { user } = useAuthStore();

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [activeTab, setActiveTab] = useState('intelligence');
  const [telemetry, setTelemetry] = useState(null);
  const [attachments, setAttachments] = useState([]);

  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);

  const messagesEndRef = useRef(null);

  // Real active user fetching (mocked for demo)
  const currentAgent = {
    id: user?.id || 'agent_1',
    name: 'Onyx User',
    role: 'L2 Support'
  };

  const isLocked = ticket?.assigned_to && ticket.assigned_to !== user?.id;
  const claimedByMember = isLocked ? teamMembers.find(m => m.id === ticket?.assigned_to) : null;
  const lockAgentName = claimedByMember ? claimedByMember.name : "Another Agent";

  useEffect(() => {
    const fetchTicketData = async () => {
      // In a real app, this would be a Supabase query
      const found = tickets.find(t => t.id === id);
      if (found) {
        setTicket(found);

        // Mock fetching messages
        setMessages([
          { id: 1, sender_id: found.customer_id, sender_type: 'customer', message_body: found.description, created_at: found.created_at }
        ]);

        // Mock telemetry data
        setTelemetry({
            analyzed_sentiment: 'Frustrated',
            confidence_score: 85,
            key_entities: ['Login', 'Error 500']
        });
        // Fetch Attachments
        const { data: files } = await supabase.storage.from('ticket_attachments').list(id + '/intake');
        if (files) setAttachments(files);
      } else {
        toast.error("Ticket not found");
        navigate('/');
      }
    };

    fetchTicketData();
  }, [id, tickets, navigate]);

  useEffect(() => {
      // Auto-scroll to bottom of messages
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!reply.trim()) return;

    const newMessage = {
      id: Date.now(),
      sender_id: isInternal ? 'system' : currentAgent.id,
      sender_type: isInternal ? 'internal' : 'agent',
      message_body: reply,
      created_at: new Date().toISOString(),
      is_internal_note: isInternal
    };

    setMessages(prev => [...prev, newMessage]);
    setReply('');
    setIsInternal(false);

    if (ticket.status === 'open' && !isInternal) {
      await updateTicketStatus(ticket.id, 'pending');
      toast.success("Status automatically updated to Pending");
    }
  };

  const updateTypingStatus = (isTyping) => {
    // In a real app, emit presence state via Supabase Realtime
  };

  if (!ticket) return (
      <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="animate-pulse flex items-center gap-4 text-cyan-400">
              <SafeIcon icon={FiCpu} className="text-3xl animate-spin" />
              <span className="font-bold tracking-widest uppercase text-sm">Onyx Core Syncing...</span>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

        <div className="lg:col-span-8 flex flex-col h-[calc(100vh-4rem)]">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-8"
          >
            <div className="flex items-center gap-6">
              <button
                onClick={() => navigate('/')}
                className="w-12 h-12 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400 transition-all hover:scale-105"
              >
                <SafeIcon icon={FiArrowLeft} className="text-xl" />
              </button>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-900 px-3 py-1 rounded-lg">
                    #{ticket.id.split('-')[0]}
                  </span>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg ${
                    ticket.priority === 'urgent' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                    ticket.priority === 'high' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {ticket.priority} Priority
                  </span>
                </div>
                <h1 className="text-3xl font-black tracking-tight">{ticket.subject}</h1>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => updateTicketStatus(ticket.id, 'resolved')}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:scale-105 flex items-center gap-2"
              >
                <SafeIcon icon={FiCheckCircle} className="text-lg" />
                Resolve Case
              </button>
            </div>
          </motion.div>

          <p className="text-zinc-400 text-xl font-medium leading-relaxed max-w-4xl mb-4">{ticket?.description}</p>
          {/* Attachments Tray */}
          {attachments?.length > 0 && (
            <>
            <div className="mt-6 flex flex-wrap gap-4 mb-4">
              {attachments.map(file => {
                const url = supabase.storage.from('ticket_attachments').getPublicUrl(`${id}/intake/${file.name}`).data.publicUrl;
                return (
                <a
                  key={file.name}
                  href={url}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-xl hover:bg-zinc-800 transition-colors text-zinc-300 text-xs font-bold"
                >
                  <SafeIcon icon={FiIcons.FiPaperclip} />
                  {file.name}
                </a>
                );
              })}
            </div>
              <p className="text-zinc-500 text-[10px] mt-2 mb-4 uppercase tracking-widest font-black">
                Attachments are automatically and permanently deleted after 90 days to ensure data privacy and compliance.
              </p>
            </>
          )}

          {/* Tier 3 Escalation Banner */}
          {ticket?.metadata?.requires_sandbox_escalation && (
            <div className="mt-8 mb-8 bg-amber-950/30 border border-amber-500/50 text-amber-400 p-4 rounded-2xl flex items-center gap-3 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              <SafeIcon icon={FiIcons.FiAlertCircle} className="text-2xl shrink-0" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest">Tier 3 Sandbox Escalation Active</h4>
                <p className="text-[10px] opacity-80 font-medium mt-0.5">Onyx confidence &lt; 85%. Sandbox Action Agent deployed for autonomous debugging.</p>
              </div>
            </div>
          )}

          <OnyxInvestigationPanel ticketId={ticket.id} />
          <AutoDraftWhisper ticketData={ticket} onApply={(draft) => setReply(draft)} />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-[3rem] overflow-hidden flex flex-col backdrop-blur-xl shadow-2xl relative"
          >
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {messages.map((msg, idx) => {
                  const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'internal';
                  return (
                      <div key={msg.id} className={`flex gap-6 ${isAgent ? 'flex-row-reverse' : ''}`}>
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2 shadow-lg ${
                              msg.sender_type === 'customer' ? 'bg-zinc-800 border-zinc-700 text-zinc-400' :
                              msg.sender_type === 'internal' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' :
                              'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                          }`}>
                              <SafeIcon icon={
                                  msg.sender_type === 'customer' ? FiGlobe :
                                  msg.sender_type === 'internal' ? FiZap : FiCpu
                              } className="text-xl" />
                          </div>
                          <div className={`flex max-w-[80%] flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
                              <div className={`px-6 py-4 rounded-[2rem] text-[15px] leading-relaxed ${
                                  msg.sender_type === 'customer' ? 'bg-zinc-800/80 border border-zinc-700/50 rounded-tl-sm text-zinc-300' :
                                  msg.sender_type === 'internal' ? 'bg-amber-500/10 border border-amber-500/20 rounded-tr-sm text-amber-100 font-mono text-sm' :
                                  'bg-cyan-500/10 border border-cyan-500/20 rounded-tr-sm text-cyan-50'
                              }`}>
                                  {msg.message_body}
                              </div>
                              <span className="text-[10px] font-bold text-zinc-600 mt-2 uppercase tracking-widest px-2">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {msg.is_internal_note && <span className="ml-2 text-amber-500/50 font-black flex items-center inline-flex gap-1"><SafeIcon icon={FiZap}/> INTERNAL</span>}
                              </span>
                          </div>
                      </div>
                  );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-zinc-950/80 border-t border-zinc-800 backdrop-blur-xl">
              {isLocked && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/50 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-bold uppercase tracking-widest">
                  <SafeIcon icon={FiLock} />
                  This case is currently locked and being handled by another agent.
                </div>
              )}
              <div className="relative">
                <textarea
                  disabled={isLocked}
                  value={reply}
                  onChange={(e) => {
                    const val = e.target.value;
                    setReply(val);

                    if (val.length > 0) {
                      updateTypingStatus(true);
                    } else {
                      updateTypingStatus(false);
                    }

                    const cursorPosition = e.target.selectionStart;
                    const textBeforeCursor = val.slice(0, cursorPosition);
                    const match = textBeforeCursor.match(/@(\w*)$/);

                    if (match) {
                      setShowMentionMenu(true);
                      setMentionQuery(match[1]);
                      setMentionIndex(cursorPosition - match[0].length);
                    } else {
                      setShowMentionMenu(false);
                    }
                  }}
                  onBlur={() => updateTypingStatus(false)}
                  placeholder={
                    isInternal
                      ? "SYSLOG: Add internal agent perspective..."
                      : "RESPOND: Craft a public resolution message..."
                  }
                  className={`w-full p-8 pb-20 rounded-[2.5rem] border-2 outline-none transition-all font-medium text-lg resize-none ${isInternal ? "bg-amber-950/10 border-amber-500/20 focus:border-amber-500/50 text-amber-100 placeholder-amber-900/50" : "bg-zinc-950 border-zinc-800 focus:border-cyan-500/50 text-white placeholder-zinc-800"} ${isLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                  rows={4}
                />

                <div className="absolute bottom-6 right-8 flex items-center gap-6">
                  <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Internal</span>
                      <button
                          onClick={() => setIsInternal(!isInternal)}
                          className={`w-12 h-6 rounded-full p-1 transition-all flex items-center ${isInternal ? 'bg-amber-500' : 'bg-zinc-800'}`}
                      >
                          <div className={`w-4 h-4 rounded-full bg-black shadow-sm transform transition-transform ${isInternal ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                  </div>
                  <button
                    disabled={isLocked}
                    onClick={handleSend}
                    className={`p-6 rounded-2xl text-black transition-all transform active:scale-90 shadow-2xl ${isInternal ? "bg-amber-500 hover:bg-amber-400" : "bg-cyan-500 hover:bg-cyan-400"} ${isLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <SafeIcon icon={FiSend} className="text-xl" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="flex p-1.5 bg-zinc-900 border border-zinc-800 rounded-3xl">
            <button
              onClick={() => setActiveTab("intelligence")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "intelligence" ? "bg-zinc-800 text-white shadow-xl" : "text-zinc-600 hover:text-zinc-400"}`}
            >
              <SafeIcon icon={FiCpu} /> Intelligence
            </button>
            <button
              onClick={() => setActiveTab("portfolio")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "portfolio" ? "bg-zinc-800 text-white shadow-xl" : "text-zinc-600 hover:text-zinc-400"}`}
            >
              <SafeIcon icon={FiLayout} /> Portfolio
            </button>
          </div>

          {activeTab === "intelligence" ? (
            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-zinc-900 border border-zinc-800 rounded-[3.5rem] p-10 shadow-2xl relative overflow-hidden group"
              >
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-14 h-14 bg-zinc-950 border border-fuchsia-500/30 rounded-2xl flex items-center justify-center text-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.3)]">
                    <SafeIcon icon={FiCpu} className="text-2xl" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight uppercase">
                      Onyx Core
                    </h2>
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-fuchsia-400 uppercase tracking-widest mt-0.5">
                      <div className="w-1 h-1 rounded-full bg-fuchsia-500 animate-pulse" />
                      Neural Processing
                    </div>
                  </div>
                </div>
                {(!telemetry || !telemetry.confidence_score) ? (
                  <div className="flex items-center justify-center p-12 bg-zinc-950/50 rounded-3xl border border-zinc-800">
                    <div className="animate-pulse text-fuchsia-400 text-xs font-black tracking-widest uppercase">
                      Onyx Neural Processing Active...
                    </div>
                  </div>
                ) : (
                  <div className="space-y-10">
                    <div className="bg-zinc-950/50 p-8 rounded-3xl border border-zinc-800">
                      <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.4em] block mb-6">
                        Sentiment
                      </label>
                      <div className="flex items-center gap-5 text-3xl font-black text-white capitalize">
                        <div className="p-3 bg-fuchsia-500/10 rounded-xl text-fuchsia-400">
                          <SafeIcon icon={FiActivity} />
                        </div>
                        {telemetry.analyzed_sentiment || "Neutral"}
                      </div>
                    </div>
                    <div className="bg-zinc-950/50 p-8 rounded-3xl border border-zinc-800">
                      <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.4em] block mb-6">
                        Confidence
                      </label>
                      <div className="flex items-end justify-between mb-6">
                        <span className="text-5xl font-black text-white mono-font tracking-tighter">
                          {telemetry.confidence_score || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-zinc-900 h-2.5 rounded-full overflow-hidden border border-zinc-800">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width: `${telemetry.confidence_score || 0}%`,
                          }}
                          className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
              <KBSidebar
                subject={ticket?.subject}
                description={ticket?.description}
                onCopySolution={(content) => {
                  setReply(content);
                  setIsInternal(false);
                  toast.success("Solution copied to draft", {
                    style: {
                      background: "#18181b",
                      color: "#22d3ee",
                      border: "1px solid #0891b2",
                    },
                  });
                }}
              />
            </div>
          ) : (
            <Customer360 customerId={ticket?.customer_id} ticketId={id} />
          )}
        </div>
      </div>
    </div>
  );
}