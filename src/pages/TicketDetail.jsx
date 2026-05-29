import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import MessageThread from '../components/tickets/MessageThread';
import Customer360 from '../components/tickets/Customer360';
import AgentPresence from '../components/AgentPresence';
import AutoDraftWhisper from '../components/tickets/AutoDraftWhisper';
import KBSidebar from '../components/tickets/KBSidebar';
import OnyxInvestigationPanel from '../components/tickets/OnyxInvestigationPanel';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import SLABadge from '../components/tickets/SLABadge';
import { motion, AnimatePresence } from 'framer-motion';
import { onyxService } from '../services/onyxService';
import toast from 'react-hot-toast';
import { useTicketStore } from '../store/useTicketStore';

const { FiArrowLeft, FiSend, FiLock, FiGlobe, FiCpu, FiLayout, FiActivity, FiMail, FiMessageSquare, FiUserPlus, FiChevronDown } = FiIcons;

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('intelligence');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [showHandoffMenu, setShowHandoffMenu] = useState(false);

  const updateTypingStatus = useTicketStore((state) => state.updateTypingStatus);

  const currentAgent = {
    agentId: 'dash-user-1',
    name: 'Greta (Local)',
    role: 'Senior Architect',
    color: 'bg-cyan-500',
  };

  const [teamMembers, setTeamMembers] = useState([
    { id: '1', name: 'Ada Lovelace', role: 'admin' },
    { id: '2', name: 'Alan Turing', role: 'support' },
    { id: '3', name: 'Grace Hopper', role: 'support' }
  ]);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      const [ticketRes, msgsRes, telemRes] = await Promise.all([
        supabase.from('support_tickets').select('*, contacts_ax2024(*)').eq('id', id).single(),
        supabase.from('ticket_messages').select('*').eq('ticket_id', id).order('created_at', { ascending: true }),
        supabase.from('ticket_ai_telemetry').select('*').eq('ticket_id', id).single()
      ]);

      if (ticketRes.data) setTicket(ticketRes.data);
      if (msgsRes.data) setMessages(msgsRes.data);
      if (telemRes.data) {
          setTelemetry(telemRes.data);
      } else if (ticketRes.data) {
          // If no telemetry exists, trigger Onyx draft generation
          const draftRes = await onyxService.generateAutoDraft(id, ticketRes.data, msgsRes.data || []);
          setTelemetry({ auto_response_draft: draftRes.draft, analyzed_sentiment: 'Processing...', confidence_score: 85 });
      }

      setLoading(false);
    };

    fetchDetails();

    const channel = supabase.channel(`ticket_${id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'ticket_messages',
        filter: `ticket_id=eq.${id}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);


  const handleTransfer = async (agent) => {
    setShowHandoffMenu(false);

    // 1. Update the ticket assigned_to column
    const { error: updateError } = await supabase
      .from('support_tickets')
      .update({ assigned_to: agent.id })
      .eq('id', id);

    if (updateError) {
      toast.error('Failed to transfer ticket.', { style: { background: '#18181b', color: '#f43f5e', border: '1px solid #9f1239' } });
      return;
    }

    // 2. Add an internal system message to the thread
    const systemMessage = `Ticket transferred to ${agent.name} by ${currentAgent.name}.`;
    const newMessage = {
      ticket_id: id,
      message_body: systemMessage,
      is_internal_note: true,
      sender_id: 'system',
    };

    const { error: msgError } = await supabase.from('ticket_messages').insert(newMessage);
    if (!msgError) {
      toast.success(`Ticket transferred to ${agent.name}`, { style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' } });
      // The ticket state and message thread will update via realtime subscriptions if configured,
      // or we can manually refetch.
      setTicket(prev => ({ ...prev, assigned_to: agent.id }));
    }
  };

  const handleSend = async () => {
    if (!reply.trim()) return;
    const newMessage = {
      ticket_id: id,
      message_body: reply,
      is_internal_note: isInternal,
      sender_id: 'agent_user', // In real app, this would be auth.uid()
    };

    const { error } = await supabase.from('ticket_messages').insert(newMessage);
    if (!error) {
        setReply('');
        toast.success(isInternal ? 'Internal note added.' : 'Reply sent to customer.', {
            style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' }
        });
    } else {
        toast.error('Failed to send message.', {
            style: { background: '#18181b', color: '#f43f5e', border: '1px solid #9f1239' }
        });
    }
  };

  const applyDraft = (draftText) => {
    setReply(draftText);
    setIsInternal(false);
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-cyan-400 mono-font font-black tracking-[0.5em] animate-pulse">INIT_ONYX_LINK...</div>;

  return (
    <div className="min-h-screen bg-black selection:bg-fuchsia-500/30">
      <div className="max-w-[1700px] mx-auto p-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Main Workspace */}
        <div className="lg:col-span-8 space-y-8">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 text-zinc-500 hover:text-cyan-400 transition-all font-black uppercase tracking-widest text-xs group">
            <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg group-hover:border-cyan-500/50 group-hover:bg-cyan-500/5 transition-all">
              <SafeIcon icon={FiArrowLeft} />
            </div>
            Back to Queue
          </button>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-[3.5rem] overflow-hidden border-zinc-800 shadow-2xl">
            <div className="p-12 border-b border-zinc-800 bg-zinc-900/20">
              <div className="flex justify-between items-start mb-10">
                <div>
                   <div className="flex items-center gap-3 mb-4">
                    <span className="mono-font text-xs text-zinc-600 font-bold tracking-tighter uppercase">CASE_PROTOCOL: {id.slice(0, 12)}</span>
                    <div className="w-1 h-1 rounded-full bg-zinc-800" />
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-[9px] font-black text-cyan-400 uppercase tracking-widest">
                      <div className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" /> LIVE_SYNC_ACTIVE
                    </div>
                    {/* Omnichannel Source Badging */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-[9px] font-black text-zinc-300 uppercase tracking-widest">
                      {ticket?.source === 'website' || ticket?.source === 'widget' ? <SafeIcon icon={FiGlobe} /> : ticket?.source === 'email' ? <SafeIcon icon={FiMail} /> : <SafeIcon icon={FiMessageSquare} />}
                      {ticket?.source || 'direct'}
                    </div>
                  </div>
                  <h1 className="text-4xl font-black text-white tracking-tighter leading-tight">{ticket?.subject}</h1>
                </div>
                <div className="flex gap-3">
                   {telemetry?.confidence_score && (
                     <div className="px-4 py-2.5 rounded-2xl bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/30 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                       <SafeIcon icon={FiCpu} />
                       {telemetry.confidence_score}% Confidence
                     </div>
                   )}
                   {telemetry?.primary_intent && (
                     <div className="px-4 py-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                       <SafeIcon icon={FiActivity} />
                       {telemetry.primary_intent}
                     </div>
                   )}
                   <div className="px-6 py-2.5 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-widest">
                    {ticket?.priority}
                  </div>

                  {/* Agent Handoff Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowHandoffMenu(!showHandoffMenu)}
                      className="px-6 py-2.5 rounded-2xl bg-zinc-900 text-cyan-400 hover:text-cyan-300 border border-zinc-700 hover:border-cyan-500/50 transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                    >
                      <SafeIcon icon={FiUserPlus} />
                      Transfer
                      <SafeIcon icon={FiChevronDown} />
                    </button>

                    <AnimatePresence>
                      {showHandoffMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl overflow-hidden z-50"
                        >
                          <div className="px-4 py-2 bg-zinc-950 border-b border-zinc-800 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            Select Agent
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            {teamMembers.map(member => (
                              <button
                                key={member.id}
                                onClick={() => handleTransfer(member)}
                                className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors flex items-center gap-3 border-b border-zinc-800/50 last:border-0"
                              >
                                <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xs font-bold">
                                  {member.name.charAt(0)}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-white">{member.name}</div>
                                  <div className="text-[10px] text-zinc-500 capitalize">{member.role}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="px-6 py-2.5 rounded-2xl bg-zinc-950 text-zinc-100 border border-zinc-800 text-[10px] font-black uppercase tracking-widest">
                    {ticket?.status}
                  </div>
                  {ticket?.sla_breach_at && <SLABadge breachAt={ticket.sla_breach_at} status={ticket.status} />}
                </div>
              </div>
              <p className="text-zinc-400 text-xl font-medium leading-relaxed max-w-4xl">{ticket?.description}</p>
            </div>

            {telemetry?.confidence_score >= 75 && telemetry?.confidence_score < 90 && telemetry?.auto_response_draft && (
              <div className="mx-12 mt-4 p-4 rounded-2xl bg-fuchsia-950/30 border border-fuchsia-500/50 flex items-start justify-between gap-6 relative overflow-hidden group">
                 <div className="absolute top-0 left-0 w-1 h-full bg-fuchsia-500" />
                 <div>
                    <div className="flex items-center gap-2 mb-2">
                       <SafeIcon icon={FiCpu} className="text-fuchsia-400" />
                       <span className="text-fuchsia-400 text-xs font-black uppercase tracking-widest">Sentinel Suggestion (Vector KB Match)</span>
                    </div>
                    <p className="text-zinc-300 text-sm">{telemetry.auto_response_draft.substring(0, 150)}...</p>
                 </div>
                 <button
                    onClick={() => applyDraft(telemetry.auto_response_draft)}
                    className="px-6 py-3 shrink-0 bg-fuchsia-500 hover:bg-fuchsia-400 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(217,70,239,0.3)]"
                 >
                    Adopt Draft
                 </button>
              </div>
            )}

            <div className="p-12 min-h-[500px] bg-zinc-950/20 space-y-12">
              <OnyxInvestigationPanel ticketId={id} />
              <MessageThread messages={messages} />
            </div>

            <div className="p-10 bg-zinc-900/40 border-t border-zinc-800">
              <AutoDraftWhisper 
                draft={telemetry?.auto_response_draft}
                onApply={applyDraft} 
              />

              <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setIsInternal(false)} className={`flex items-center gap-2 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${!isInternal ? 'bg-cyan-500 text-black shadow-[0_0_25px_rgba(34,211,238,0.4)]' : 'text-zinc-600 hover:text-zinc-400'}`}>
                  <SafeIcon icon={FiGlobe} /> External Relay
                </button>
                <button onClick={() => setIsInternal(true)} className={`flex items-center gap-2 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isInternal ? 'bg-amber-500 text-black shadow-[0_0_25px_rgba(245,158,11,0.4)]' : 'text-zinc-600 hover:text-zinc-400'}`}>
                  <SafeIcon icon={FiLock} /> Secure Note
                </button>
              </div>
              
              <div className="relative group">
                <textarea 
                  value={reply}
                  onChange={(e) => {
                    const val = e.target.value;
                    setReply(val);

                    if (val.length > 0) {
                      updateTypingStatus(true, currentAgent);
                    } else {
                      updateTypingStatus(false, currentAgent);
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
                  onBlur={() => updateTypingStatus(false, currentAgent)}
                  placeholder={isInternal ? "SYSLOG: Add internal agent perspective..." : "RESPOND: Craft a public resolution message..."}
                  className={`w-full p-8 pb-20 rounded-[2.5rem] border-2 outline-none transition-all font-medium text-lg resize-none ${isInternal ? 'bg-amber-950/10 border-amber-500/20 focus:border-amber-500/50 text-amber-100 placeholder-amber-900/50' : 'bg-zinc-950 border-zinc-800 focus:border-cyan-500/50 text-white placeholder-zinc-800'}`}
                  rows={4}
                />
                <AnimatePresence>
                  {showMentionMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-32 left-8 w-64 bg-zinc-900/80 backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-2xl overflow-hidden z-50"
                    >
                      {teamMembers
                        .filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
                        .map(member => (
                          <button
                            key={member.id}
                            onClick={() => {
                                const newReply = reply.slice(0, mentionIndex) + '@' + member.name + ' ' + reply.slice(mentionIndex + mentionQuery.length + 1);
                                setReply(newReply);
                                setShowMentionMenu(false);
                                setIsInternal(true);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-zinc-800/50 transition-colors flex items-center gap-3 border-b border-zinc-800/50 last:border-0"
                          >
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-cyan-400">
                                {member.name.charAt(0)}
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white">{member.name}</div>
                                <div className="text-[10px] uppercase font-black tracking-widest text-zinc-500">{member.role}</div>
                            </div>
                          </button>
                        ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="absolute bottom-6 right-8 flex items-center gap-6">
                   <button onClick={handleSend} className={`p-6 rounded-2xl text-black transition-all transform active:scale-90 shadow-2xl ${isInternal ? 'bg-amber-500 hover:bg-amber-400' : 'bg-cyan-500 hover:bg-cyan-400'}`}>
                    <SafeIcon icon={FiSend} className="text-xl" />
                   </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Intelligence & Portfolio Sidebar */}
        <div className="lg:col-span-4 space-y-8">
          <div className="flex p-1.5 bg-zinc-900 border border-zinc-800 rounded-3xl">
            <button 
              onClick={() => setActiveTab('intelligence')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'intelligence' ? 'bg-zinc-800 text-white shadow-xl' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <SafeIcon icon={FiCpu} /> Intelligence
            </button>
            <button 
              onClick={() => setActiveTab('portfolio')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'portfolio' ? 'bg-zinc-800 text-white shadow-xl' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <SafeIcon icon={FiLayout} /> Portfolio
            </button>
          </div>

          {activeTab === 'intelligence' ? (
            <div className="space-y-8">
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-zinc-900 border border-zinc-800 rounded-[3.5rem] p-10 shadow-2xl relative overflow-hidden group">
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-14 h-14 bg-zinc-950 border border-fuchsia-500/30 rounded-2xl flex items-center justify-center text-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.3)]">
                    <SafeIcon icon={FiCpu} className="text-2xl" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight uppercase">Onyx Core</h2>
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-fuchsia-400 uppercase tracking-widest mt-0.5">
                       <div className="w-1 h-1 rounded-full bg-fuchsia-500 animate-pulse" />
                       Neural Processing
                    </div>
                  </div>
                </div>
                <div className="space-y-10">
                  <div className="bg-zinc-950/50 p-8 rounded-3xl border border-zinc-800">
                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.4em] block mb-6">Sentiment</label>
                    <div className="flex items-center gap-5 text-3xl font-black text-white capitalize">
                      <div className="p-3 bg-fuchsia-500/10 rounded-xl text-fuchsia-400"><SafeIcon icon={FiActivity} /></div>
                      {telemetry?.analyzed_sentiment || 'Neutral'}
                    </div>
                  </div>
                  <div className="bg-zinc-950/50 p-8 rounded-3xl border border-zinc-800">
                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.4em] block mb-6">Confidence</label>
                    <div className="flex items-end justify-between mb-6">
                      <span className="text-5xl font-black text-white mono-font tracking-tighter">{telemetry?.confidence_score || 0}%</span>
                    </div>
                    <div className="w-full bg-zinc-900 h-2.5 rounded-full overflow-hidden border border-zinc-800">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${telemetry?.confidence_score || 0}%` }} className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]" />
                    </div>
                  </div>
                </div>
              </motion.div>
              <KBSidebar subject={ticket?.subject} description={ticket?.description} onCopySolution={(content) => { setReply(content); setIsInternal(false); toast.success("Solution copied to draft", {style: { background: "#18181b", color: "#22d3ee", border: "1px solid #0891b2" }}); }} />
            </div>
          ) : (
            <Customer360 customerId={ticket?.customer_id} ticketId={id} />
          )}
        </div>

      </div>
    </div>
  );
}
